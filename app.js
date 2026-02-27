import { createApp, ref, reactive, computed, watch, onMounted } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import { db } from './firebase-config.js'; 
import { collection, addDoc, onSnapshot, query, updateDoc, deleteDoc, doc, setDoc, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const gerarDataAtualInput = () => {
    const agora = new Date(); 
    const offset = agora.getTimezoneOffset() * 60000;
    return new Date(agora.getTime() - offset).toISOString().slice(0, 16);
};

createApp({
    setup() {
        const usuarioLogado = ref(JSON.parse(localStorage.getItem('qc_user')) || null);
        const loginForm = reactive({ email: '', senha: '' });
        const erroLogin = ref('');

        const currentTab = ref('dashboard');
        const menuMobileAberto = ref(false);
        const mensagemSucesso = ref(false);
        const visaoMetas = ref('mensal'); 
        const abaHistorico = ref('Produção');
        const abaConsequencias = ref('Geral');
        const carregando = ref(false);
        const chartInstance = ref(null);

        const isDarkMode = ref(localStorage.getItem('qc_theme') === 'dark');
        const toggleTheme = () => {
            isDarkMode.value = !isDarkMode.value;
            localStorage.setItem('qc_theme', isDarkMode.value ? 'dark' : 'light');
            document.documentElement.classList.toggle('dark', isDarkMode.value);
            if (currentTab.value === 'dashboard') setTimeout(() => renderizarGraficoEvolucao(), 50);
        };

        const regraAtiva = ref(true);
        const metas = reactive({ producaoMensal: 0, producaoAnual: 0, estoqueMensal: 0, estoqueAnual: 0, rpvMensal: 0, rpvAnual: 0 });
        const listaCausas = ref([]);
        const listaResponsaveis = ref([]); 

        const filtros = reactive({ causa: '', responsavel: '' });
        const form = reactive({ 
            local: '', causa: '', responsavel: '', 
            quantidade: 1, dataOcorrencia: gerarDataAtualInput(), contabilizar: true 
        });
        
        const registrosGerais = ref([]);
        const registros = computed(() => {
            if (!usuarioLogado.value) return [];
            return registrosGerais.value.filter(r => r.fabrica === usuarioLogado.value.fabricaAtual);
        });

        const colaboradoresFiltrados = computed(() => {
            if (!usuarioLogado.value || !listaResponsaveis.value) return [];
            
            const fabricaAtual = usuarioLogado.value.fabricaAtual || 'Fábrica 2';
            
            return listaResponsaveis.value
                .filter(c => {
                    const fabs = (c.fabricas && c.fabricas.length > 0) ? c.fabricas : ['Fábrica 2'];
                    return fabs.includes(fabricaAtual);
                })
                .map(c => c.nome);
        });

        const responsaveisDoUsuario = computed(() => {
            if (!usuarioLogado.value || !listaResponsaveis.value) return [];
            if (usuarioLogado.value.nivelAcesso === 'Coordenador') {
                return listaResponsaveis.value;
            }
            
            const userFabs = usuarioLogado.value.fabricas || ['Fábrica 2'];
            return listaResponsaveis.value.filter(colab => {
                const fabs = (colab.fabricas && colab.fabricas.length > 0) ? colab.fabricas : ['Fábrica 2'];
                return fabs.some(f => userFabs.includes(f));
            });
        });

        const modalEdicao = reactive({ 
            aberto: false, id: null, local: '', causa: '', 
            responsavel: '', quantidade: 1, dataOcorrencia: '', contabilizar: true 
        });
        
        const modalRaioX = reactive({ aberto: false, nome: '', total: 0, causaFrequente: '', ultimos: [] });
        const modalSenha = reactive({ aberto: false, novaSenha: '', confirmarSenha: '', mensagem: '', erro: false });

        const novaCausa = ref(''); 
        const formColaborador = reactive({ nome: '', fabricas: [] });

        const fazerLogin = async () => {
            erroLogin.value = ''; carregando.value = true;
            try {
                const q = query(collection(db, "usuarios"), where("email", "==", loginForm.email), where("senha", "==", loginForm.senha));
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) {
                    const docUser = querySnapshot.docs[0]; const data = docUser.data();
                    usuarioLogado.value = { id: docUser.id, nome: data.nome, email: data.email, nivelAcesso: data.nivelAcesso, fabricas: data.fabricas, fabricaAtual: data.fabricas[0] };
                    salvarSessao(); loginForm.email = ''; loginForm.senha = ''; currentTab.value = 'dashboard';
                    iniciarMonitoramentoBanco();
                } else { erroLogin.value = 'Acesso Negado. Verifique os dados.'; }
            } catch (e) { erroLogin.value = 'Erro de conexão com servidor.'; } 
            finally { carregando.value = false; }
        };

        const fazerLogout = () => { usuarioLogado.value = null; localStorage.removeItem('qc_user'); };
        const salvarSessao = () => { localStorage.setItem('qc_user', JSON.stringify(usuarioLogado.value)); if (currentTab.value === 'dashboard') setTimeout(renderizarGraficoEvolucao, 100); };

        const iniciarMonitoramentoBanco = () => {
            if (!usuarioLogado.value) return;
            carregando.value = true;
            
            const docConfig = doc(db, "configuracoes", "geral");
            onSnapshot(docConfig, (snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.data();
                    if (data.regraAtiva !== undefined) regraAtiva.value = data.regraAtiva;
                    if (data.metas) Object.assign(metas, data.metas);
                    if (data.causas) listaCausas.value = data.causas;
                    
                    if (data.responsaveis) {
                        listaResponsaveis.value = data.responsaveis.map(item => {
                            if (typeof item === 'string') return { nome: item, fabricas: ['Fábrica 2'] };
                            if (!item.fabricas || item.fabricas.length === 0) item.fabricas = ['Fábrica 2'];
                            return item;
                        });
                    }
                }
            });

            const q = query(collection(db, "registros"));
            onSnapshot(q, (snapshot) => {
                const dadosMapeados = [];
                snapshot.forEach((docSnap) => {
                    const dado = docSnap.data();
                    let d = null;
                    if (dado.timestamp) {
                        d = dado.timestamp.toDate ? dado.timestamp.toDate() : new Date(dado.timestamp);
                    }
                    let tempoMilisegundos = d ? d.getTime() : 0;
                    let dataFormatada = d ? `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth()+1).toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}` : '';

                    let nomeResponsavel = dado.responsavel;
                    if (typeof nomeResponsavel === 'object' && nomeResponsavel !== null) {
                        nomeResponsavel = nomeResponsavel.nome || 'Indefinido';
                    }

                    dadosMapeados.push({ 
                        id: docSnap.id, local: dado.local, causa: dado.causa, 
                        responsavel: nomeResponsavel || 'Indefinido', 
                        quantidade: Number(dado.quantidade || 1), 
                        dataHoraFormatada: dataFormatada, dataObj: d, 
                        ordenacaoTempo: tempoMilisegundos, contabilizar: dado.contabilizar !== false, 
                        fabrica: dado.fabrica || 'Fábrica 1' 
                    });
                });
                dadosMapeados.sort((a, b) => b.ordenacaoTempo - a.ordenacaoTempo);
                registrosGerais.value = dadosMapeados;
                carregando.value = false;
                if(currentTab.value === 'dashboard') setTimeout(renderizarGraficoEvolucao, 350);
            });
        };

        onMounted(() => {
            document.documentElement.classList.toggle('dark', isDarkMode.value);
            if(usuarioLogado.value) iniciarMonitoramentoBanco();
        });

        const salvarConfiguracoes = async () => { await setDoc(doc(db, "configuracoes", "geral"), { regraAtiva: regraAtiva.value, metas: { ...metas }, causas: listaCausas.value, responsaveis: listaResponsaveis.value }, { merge: true }); };
        const salvarRegra = () => salvarConfiguracoes();
        
        const adicionarCausa = () => { if(novaCausa.value.trim()){ listaCausas.value.push(novaCausa.value.trim()); novaCausa.value = ''; salvarConfiguracoes(); } };
        const removerCausa = (index) => { listaCausas.value.splice(index, 1); salvarConfiguracoes(); };
        
        const adicionarColaborador = () => { 
            if(formColaborador.nome.trim() && formColaborador.fabricas.length > 0){ 
                listaResponsaveis.value.push({
                    nome: formColaborador.nome.trim(),
                    fabricas: [...formColaborador.fabricas]
                }); 
                formColaborador.nome = ''; formColaborador.fabricas = []; salvarConfiguracoes(); 
            } else { alert("Preencha o nome e marque pelo menos uma fábrica."); }
        };
        
        const removerColaborador = (nomeColaborador) => { 
            const index = listaResponsaveis.value.findIndex(c => c.nome === nomeColaborador);
            if (index !== -1) { listaResponsaveis.value.splice(index, 1); salvarConfiguracoes(); }
        };

        const mudarAba = (aba) => { currentTab.value = aba; menuMobileAberto.value = false; };
        const limparFiltros = () => { filtros.causa = ''; filtros.responsavel = ''; };

        const abrirModalSenha = () => { modalSenha.novaSenha = ''; modalSenha.confirmarSenha = ''; modalSenha.mensagem = ''; modalSenha.erro = false; modalSenha.aberto = true; };
        const alterarSenha = async () => {
            if (modalSenha.novaSenha !== modalSenha.confirmarSenha) { modalSenha.mensagem = 'As senhas não coincidem!'; modalSenha.erro = true; return; }
            if (modalSenha.novaSenha.length < 6) { modalSenha.mensagem = 'Mínimo 6 caracteres.'; modalSenha.erro = true; return; }
            try { await updateDoc(doc(db, "usuarios", usuarioLogado.value.id), { senha: modalSenha.novaSenha }); modalSenha.mensagem = 'Senha atualizada!'; modalSenha.erro = false; setTimeout(() => { modalSenha.aberto = false; }, 1500); } catch (e) { console.error(e); }
        };

        const salvarRegistro = async () => {
            try {
                await addDoc(collection(db, "registros"), {
                    local: form.local, causa: form.causa, responsavel: form.responsavel, 
                    quantidade: Number(form.quantidade), timestamp: new Date(form.dataOcorrencia), 
                    contabilizar: form.contabilizar, fabrica: usuarioLogado.value.fabricaAtual
                });
                form.local = ''; form.causa = ''; form.responsavel = ''; form.quantidade = 1; form.dataOcorrencia = gerarDataAtualInput(); form.contabilizar = true; 
                mensagemSucesso.value = true; setTimeout(() => { mensagemSucesso.value = false; }, 2000);
            } catch (e) { console.error(e); }
        };

        const deletarRegistro = async (id) => { if(confirm("Excluir?")) { await deleteDoc(doc(db, "registros", id)); } };
        const abrirEdicao = (reg) => { 
            modalEdicao.id = reg.id; modalEdicao.local = reg.local; modalEdicao.causa = reg.causa; 
            modalEdicao.responsavel = reg.responsavel; modalEdicao.quantidade = reg.quantidade; modalEdicao.contabilizar = reg.contabilizar;
            if(reg.dataObj) {
                const offset = reg.dataObj.getTimezoneOffset() * 60000;
                modalEdicao.dataOcorrencia = new Date(reg.dataObj.getTime() - offset).toISOString().slice(0, 16);
            }
            modalEdicao.aberto = true; 
        };
        const salvarEdicao = async () => { 
            await updateDoc(doc(db, "registros", modalEdicao.id), { 
                local: modalEdicao.local, causa: modalEdicao.causa, responsavel: modalEdicao.responsavel, 
                quantidade: Number(modalEdicao.quantidade), contabilizar: modalEdicao.contabilizar, timestamp: new Date(modalEdicao.dataOcorrencia)
            }); 
            modalEdicao.aberto = false; 
        };

        const abrirRaioX = (nomeColaborador) => {
            modalRaioX.nome = nomeColaborador;
            const regsColab = registros.value.filter(r => r.responsavel === nomeColaborador);
            modalRaioX.total = regsColab.reduce((acc, r) => acc + (r.quantidade || 1), 0);
            modalRaioX.aberto = true;
        };

        const statusEquipe = computed(() => {
            const isRPVTab = abaConsequencias.value === 'RPV';
            
            const dataLimiteNormal = new Date(); dataLimiteNormal.setDate(dataLimiteNormal.getDate() - 60);
            const dataLimiteRPV = new Date(); dataLimiteRPV.setMonth(dataLimiteRPV.getMonth() - 6);
            const dataLimite = isRPVTab ? dataLimiteRPV : dataLimiteNormal;

            return colaboradoresFiltrados.value.map(nomeResp => {
                const registrosValidos = registros.value.filter(r => 
                    r.contabilizar !== false && r.dataObj && r.responsavel === nomeResp &&
                    (isRPVTab ? r.local === 'RPV' : r.local !== 'RPV') && 
                    r.dataObj >= dataLimite
                );
                
                let totalGeral = 0; 
                let erroDeVez = false; 
                
                registrosValidos.forEach(r => { 
                    const qtd = Number(r.quantidade || 1);
                    totalGeral += qtd; 
                    if (qtd >= 3) erroDeVez = true; 
                });
                
                let status = "Sem advertência"; 
                let cor = "text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800";
                
                if (isRPVTab) {
                    if (totalGeral > 0) {
                        status = "Adv. Escrita (RPV)";
                        cor = "text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 border-rose-300 dark:border-rose-800";
                    }
                } else {
                    if (erroDeVez || totalGeral >= 3) { 
                        status = "Advertência Escrita"; cor = "text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 border-rose-300 dark:border-rose-800"; 
                    } else if (totalGeral === 2) { 
                        status = "Advertência Verbal"; cor = "text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 border-orange-300 dark:border-orange-800"; 
                    }
                }
                
                return { nome: nomeResp, total: totalGeral, status, cor };
            }).sort((a, b) => b.total - a.total);
        });

        const destaquesEquipe = computed(() => {
            const isRPVTab = abaConsequencias.value === 'RPV';
            
            const dataLimiteNormal = new Date(); dataLimiteNormal.setDate(dataLimiteNormal.getDate() - 60);
            const dataLimiteRPV = new Date(); dataLimiteRPV.setMonth(dataLimiteRPV.getMonth() - 6);
            const dataLimite = isRPVTab ? dataLimiteRPV : dataLimiteNormal;

            return colaboradoresFiltrados.value.filter(nomeResp => {
                return !registros.value.some(r => {
                    if (r.contabilizar === false || !r.dataObj || r.responsavel !== nomeResp) return false;
                    
                    if (isRPVTab) {
                        return r.local === 'RPV' && r.dataObj >= dataLimite;
                    } else {
                        return r.local !== 'RPV' && r.dataObj >= dataLimite;
                    }
                });
            });
        });

        const limiteProducao = computed(() => visaoMetas.value === 'mensal' ? metas.producaoMensal : metas.producaoAnual);
        const limiteEstoque = computed(() => visaoMetas.value === 'mensal' ? metas.estoqueMensal : metas.estoqueAnual);
        const limiteRPV = computed(() => visaoMetas.value === 'mensal' ? metas.rpvMensal : metas.rpvAnual);
        
        const totalProducao = computed(() => registros.value.filter(r => r.local === 'Produção').reduce((acc, r) => acc + (r.quantidade || 1), 0));
        const totalEstoque = computed(() => registros.value.filter(r => r.local === 'Estoque').reduce((acc, r) => acc + (r.quantidade || 1), 0));
        const totalRPV = computed(() => registros.value.filter(r => r.local === 'RPV').reduce((acc, r) => acc + (r.quantidade || 1), 0));
        
        const percentualProducao = computed(() => limiteProducao.value > 0 ? (totalProducao.value / limiteProducao.value) * 100 : 0);
        const percentualEstoque = computed(() => limiteEstoque.value > 0 ? (totalEstoque.value / limiteEstoque.value) * 100 : 0);
        const percentualRPV = computed(() => limiteRPV.value > 0 ? (totalRPV.value / limiteRPV.value) * 100 : 0);
        
        const historicoFiltrado = computed(() => registros.value.filter(reg => reg.local === abaHistorico.value && (filtros.causa === '' || reg.causa === filtros.causa) && (filtros.responsavel === '' || reg.responsavel === filtros.responsavel)));

        const renderizarGraficoEvolucao = () => {
            const ctx = document.getElementById('evolucaoChart'); if (!ctx) return;
            if (chartInstance.value) chartInstance.value.destroy();
            const agrupamentoPorMes = {};
            [...registros.value].reverse().forEach(reg => {
                if(!reg.dataObj) return;
                const d = reg.dataObj; const mesAno = `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
                if (!agrupamentoPorMes[mesAno]) agrupamentoPorMes[mesAno] = { producao: 0, estoque: 0, rpv: 0 };
                
                if (reg.local === 'Produção') agrupamentoPorMes[mesAno].producao += (reg.quantidade || 1); 
                else if (reg.local === 'Estoque') agrupamentoPorMes[mesAno].estoque += (reg.quantidade || 1);
                else if (reg.local === 'RPV') agrupamentoPorMes[mesAno].rpv += (reg.quantidade || 1);
            });
            const mesesLabels = Object.keys(agrupamentoPorMes);
            const nomesMeses = {'01':'Jan', '02':'Fev', '03':'Mar', '04':'Abr', '05':'Mai', '06':'Jun', '07':'Jul', '08':'Ago', '09':'Set', '10':'Out', '11':'Nov', '12':'Dez'};
            
            const bgProducao = mesesLabels.map(m => agrupamentoPorMes[m].producao > metas.producaoMensal ? '#ef4444' : '#10b981');
            const bgEstoque = mesesLabels.map(m => agrupamentoPorMes[m].estoque > metas.estoqueMensal ? '#ef4444' : '#10b981');
            const bgRPV = mesesLabels.map(m => agrupamentoPorMes[m].rpv > metas.rpvMensal ? '#ef4444' : '#a855f7');
            
            const tc = isDarkMode.value ? '#94a3b8' : '#64748b'; const gc = isDarkMode.value ? '#334155' : '#f1f5f9';
            const pluginTitulos = { id: 'titulosEmbaixo', afterDatasetsDraw(chart) { const { ctx, scales: { x, y } } = chart; ctx.save(); ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = isDarkMode.value ? '#cbd5e1' : '#64748b'; chart.data.datasets.forEach((dataset, i) => { const meta = chart.getDatasetMeta(i); if (!meta.hidden) { meta.data.forEach((bar) => { const label = dataset.label === 'Produção' ? 'PROD' : (dataset.label === 'Estoque' ? 'EST' : 'RPV'); ctx.fillText(label, bar.x, y.bottom + 6); }); } }); ctx.restore(); } };
            
            chartInstance.value = new Chart(ctx, { 
                type: 'bar', 
                data: { 
                    labels: mesesLabels.map(ma => `${nomesMeses[ma.split('/')[0]]}/${ma.split('/')[1].substring(2)}`), 
                    datasets: [
                        { label: 'Produção', data: mesesLabels.map(m => agrupamentoPorMes[m].producao), backgroundColor: bgProducao, borderRadius: 4 }, 
                        { label: 'Estoque', data: mesesLabels.map(m => agrupamentoPorMes[m].estoque), backgroundColor: bgEstoque, borderRadius: 4 },
                        { label: 'RPV', data: mesesLabels.map(m => agrupamentoPorMes[m].rpv), backgroundColor: bgRPV, borderRadius: 4 }
                    ] 
                }, 
                options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { color: tc, font: { weight: 'bold' }, padding: 22 }, grid: { color: gc, drawBorder: false } }, y: { ticks: { color: tc }, grid: { color: gc, drawBorder: false } } }, plugins: { legend: { labels: { color: tc } } } }, 
                plugins: [pluginTitulos] 
            });
        };

        watch(currentTab, (newTab) => { if (newTab === 'dashboard') setTimeout(renderizarGraficoEvolucao, 350); });

        return {
            usuarioLogado, loginForm, erroLogin, fazerLogin, fazerLogout, salvarSessao, currentTab, menuMobileAberto, mudarAba, carregando, isDarkMode, toggleTheme, regraAtiva, salvarRegra, form, salvarRegistro, mensagemSucesso, modalEdicao, abrirEdicao, salvarEdicao, visaoMetas, metas, salvarConfiguracoes, totalProducao, totalEstoque, totalRPV, percentualProducao, percentualEstoque, percentualRPV, limiteProducao, limiteEstoque, limiteRPV, registros, abaHistorico, abaConsequencias, filtros, historicoFiltrado, limparFiltros, deletarRegistro, listaCausas, novaCausa, adicionarCausa, removerCausa, listaResponsaveis, formColaborador, adicionarColaborador, removerColaborador, statusEquipe, destaquesEquipe, modalRaioX, abrirRaioX, modalSenha, abrirModalSenha, alterarSenha, colaboradoresFiltrados, responsaveisDoUsuario
        }
    }
}).mount('#app')
