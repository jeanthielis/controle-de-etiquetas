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
        const carregando = ref(false);
        const chartInstance = ref(null);

        const isDarkMode = ref(localStorage.getItem('qc_theme') === 'dark');
        const toggleTheme = () => {
            isDarkMode.value = !isDarkMode.value;
            localStorage.setItem('qc_theme', isDarkMode.value ? 'dark' : 'light');
            document.documentElement.classList.toggle('dark', isDarkMode.value);
            if (currentTab.value === 'dashboard') {
                setTimeout(() => renderizarGraficoEvolucao(), 50);
            }
        };

        const regraAtiva = ref(true);
        const metas = reactive({ producaoMensal: 0, producaoAnual: 0, estoqueMensal: 0, estoqueAnual: 0 });
        const listaCausas = ref([]);
        
        // Agora listaResponsaveis armazenará objetos: { nome: 'João', fabrica: 'Fábrica 2' }
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

        const modalEdicao = reactive({ 
            aberto: false, id: null, local: '', causa: '', 
            responsavel: '', quantidade: 1, dataOcorrencia: '', contabilizar: true 
        });
        
        const modalRaioX = reactive({ aberto: false, nome: '', total: 0, causaFrequente: '', ultimos: [] });
        const modalSenha = reactive({ aberto: false, novaSenha: '', confirmarSenha: '', mensagem: '', erro: false });

        const novaCausa = ref(''); 
        
        // Novos campos para cadastro de Colaborador
        const novoColaboradorNome = ref('');
        const novoColaboradorFabrica = ref('Fábrica 1');

        const fazerLogin = async () => {
            erroLogin.value = ''; 
            carregando.value = true;
            try {
                const q = query(
                    collection(db, "usuarios"), 
                    where("email", "==", loginForm.email), 
                    where("senha", "==", loginForm.senha)
                );
                const querySnapshot = await getDocs(q);
                
                if (!querySnapshot.empty) {
                    const docUser = querySnapshot.docs[0]; 
                    const data = docUser.data();
                    usuarioLogado.value = { 
                        id: docUser.id, nome: data.nome, email: data.email, 
                        nivelAcesso: data.nivelAcesso, fabricas: data.fabricas, 
                        fabricaAtual: data.fabricas[0] 
                    };
                    salvarSessao();
                    loginForm.email = ''; loginForm.senha = '';
                    currentTab.value = 'dashboard';
                    iniciarMonitoramentoBanco();
                } else { 
                    erroLogin.value = 'Acesso Negado. Verifique os dados.'; 
                }
            } catch (e) { 
                erroLogin.value = 'Erro de conexão com servidor.'; 
            } finally { 
                carregando.value = false; 
            }
        };

        const fazerLogout = () => { usuarioLogado.value = null; localStorage.removeItem('qc_user'); };
        
        const salvarSessao = () => { 
            localStorage.setItem('qc_user', JSON.stringify(usuarioLogado.value)); 
            if (currentTab.value === 'dashboard') setTimeout(renderizarGraficoEvolucao, 100); 
        };

        const iniciarMonitoramentoBanco = () => {
            if (!usuarioLogado.value) return;
            carregando.value = true;
            
            novoColaboradorFabrica.value = usuarioLogado.value.fabricaAtual;

            const docConfig = doc(db, "configuracoes", "geral");
            onSnapshot(docConfig, (snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.data();
                    if (data.regraAtiva !== undefined) regraAtiva.value = data.regraAtiva;
                    if (data.metas) Object.assign(metas, data.metas);
                    if (data.causas) listaCausas.value = data.causas;
                    
                    if (data.responsaveis) {
                        // MIGRAÇÃO INTELIGENTE: Se achar nomes antigos como texto puro, transforma em objeto "Fábrica 2"
                        let precisaSalvar = false;
                        listaResponsaveis.value = data.responsaveis.map(r => {
                            if (typeof r === 'string') {
                                precisaSalvar = true;
                                return { nome: r, fabrica: 'Fábrica 2' };
                            }
                            return r;
                        });
                        // Salva silenciosamente se tiver feito a migração de textos pra objetos
                        if (precisaSalvar) salvarConfiguracoes();
                    }
                }
            });

            const q = query(collection(db, "registros"));
            onSnapshot(q, (snapshot) => {
                const dadosMapeados = [];
                snapshot.forEach((docSnap) => {
                    const dado = docSnap.data();
                    let timestampRaw = dado.timestamp || null;
                    let tempoMilisegundos = 0; let dataFormatada = '';
                    if (timestampRaw) {
                        const d = timestampRaw.toDate();
                        tempoMilisegundos = d.getTime();
                        dataFormatada = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
                    }

                    dadosMapeados.push({ 
                        id: docSnap.id, local: dado.local, causa: dado.causa, responsavel: dado.responsavel, 
                        quantidade: dado.quantidade || 1, dataHoraFormatada: dataFormatada, timestampRaw: timestampRaw, 
                        ordenacaoTempo: tempoMilisegundos, contabilizar: dado.contabilizar !== false, fabrica: dado.fabrica || 'Fábrica 1' 
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

        // Computed que filtra a equipe apenas para a fábrica em que o usuário está atuando agora
        const colaboradoresDaFabricaAtual = computed(() => {
            if (!usuarioLogado.value) return [];
            return listaResponsaveis.value
                .filter(r => r.fabrica === usuarioLogado.value.fabricaAtual)
                .map(r => r.nome);
        });

        const abrirModalSenha = () => {
            modalSenha.novaSenha = ''; modalSenha.confirmarSenha = ''; modalSenha.mensagem = ''; modalSenha.erro = false; modalSenha.aberto = true;
        };

        const alterarSenha = async () => {
            if (modalSenha.novaSenha !== modalSenha.confirmarSenha) { modalSenha.mensagem = 'As senhas não coincidem!'; modalSenha.erro = true; return; }
            if (modalSenha.novaSenha.length < 6) { modalSenha.mensagem = 'A senha deve ter pelo menos 6 caracteres.'; modalSenha.erro = true; return; }

            try {
                await updateDoc(doc(db, "usuarios", usuarioLogado.value.id), { senha: modalSenha.novaSenha });
                modalSenha.mensagem = 'Senha atualizada com sucesso!'; modalSenha.erro = false;
                setTimeout(() => { modalSenha.aberto = false; }, 1500);
            } catch (error) { modalSenha.mensagem = 'Erro ao atualizar a senha.'; modalSenha.erro = true; }
        };

        const salvarConfiguracoes = async () => { 
            await setDoc(doc(db, "configuracoes", "geral"), { regraAtiva: regraAtiva.value, metas: { ...metas }, causas: listaCausas.value, responsaveis: listaResponsaveis.value }, { merge: true }); 
        };
        const salvarRegra = () => salvarConfiguracoes();
        const adicionarCausa = () => { if(novaCausa.value.trim()){ listaCausas.value.push(novaCausa.value.trim()); novaCausa.value = ''; salvarConfiguracoes(); } };
        const removerCausa = (index) => { listaCausas.value.splice(index, 1); salvarConfiguracoes(); };
        
        // Alterado para salvar o objeto (Nome + Fábrica)
        const adicionarColaborador = () => { 
            if(novoColaboradorNome.value.trim()){ 
                listaResponsaveis.value.push({
                    nome: novoColaboradorNome.value.trim(),
                    fabrica: novoColaboradorFabrica.value
                }); 
                novoColaboradorNome.value = ''; 
                salvarConfiguracoes(); 
            } 
        };
        const removerColaborador = (index) => { listaResponsaveis.value.splice(index, 1); salvarConfiguracoes(); };

        const mudarAba = (aba) => { currentTab.value = aba; menuMobileAberto.value = false; };
        const limparFiltros = () => { filtros.causa = ''; filtros.responsavel = ''; };

        const salvarRegistro = async () => {
            try {
                await addDoc(collection(db, "registros"), {
                    local: form.local, causa: form.causa, responsavel: form.responsavel, quantidade: form.quantidade, 
                    timestamp: new Date(form.dataOcorrencia), contabilizar: form.contabilizar, fabrica: usuarioLogado.value.fabricaAtual
                });
                form.local = ''; form.causa = ''; form.responsavel = ''; form.quantidade = 1; form.dataOcorrencia = gerarDataAtualInput(); form.contabilizar = true; 
                mensagemSucesso.value = true; setTimeout(() => { mensagemSucesso.value = false; }, 2000);
            } catch (e) { console.error(e); }
        };

        const deletarRegistro = async (id) => { if(confirm("Excluir este registro?")) { await deleteDoc(doc(db, "registros", id)); } };

        const abrirEdicao = (reg) => {
            modalEdicao.id = reg.id; modalEdicao.local = reg.local; modalEdicao.causa = reg.causa; responsavel: reg.responsavel; modalEdicao.responsavel = reg.responsavel; modalEdicao.quantidade = reg.quantidade; modalEdicao.contabilizar = reg.contabilizar; modalEdicao.aberto = true;
        };
        const salvarEdicao = async () => {
            await updateDoc(doc(db, "registros", modalEdicao.id), { local: modalEdicao.local, causa: modalEdicao.causa, responsavel: modalEdicao.responsavel, quantidade: modalEdicao.quantidade, contabilizar: modalEdicao.contabilizar }); modalEdicao.aberto = false;
        };

        const abrirRaioX = (nomeColaborador) => {
            modalRaioX.nome = nomeColaborador;
            const regsColab = registros.value.filter(r => r.responsavel === nomeColaborador);
            modalRaioX.total = regsColab.reduce((acc, r) => acc + (r.quantidade || 1), 0);
            modalRaioX.aberto = true;
        };

        // Inteligência para basear a Consequência na Equipe da Fábrica Atual
        const statusEquipe = computed(() => {
            const dataLimite = new Date(); dataLimite.setDate(dataLimite.getDate() - 60);
            return colaboradoresDaFabricaAtual.value.map(resp => {
                const registrosRecentes = registros.value.filter(r => r.contabilizar !== false && r.timestampRaw && r.responsavel === resp && r.timestampRaw.toDate() >= dataLimite);
                let total = 0; let erroDeVez = false;
                registrosRecentes.forEach(r => { total += (r.quantidade || 1); if ((r.quantidade || 1) >= 3) erroDeVez = true; });
                let status = "Sem advertência"; let cor = "text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800";
                if (erroDeVez || total >= 3) { status = "Advertência Escrita"; cor = "text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 border-rose-300 dark:border-rose-800"; } 
                else if (total === 2) { status = "Advertência Verbal"; cor = "text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 border-orange-300 dark:border-orange-800"; }
                return { nome: resp, total, status, cor };
            }).sort((a, b) => b.total - a.total);
        });

        const destaquesEquipe = computed(() => {
            const dataLimite = new Date(); dataLimite.setDate(dataLimite.getDate() - 60);
            return colaboradoresDaFabricaAtual.value.filter(resp => {
                return !registros.value.some(r => r.contabilizar !== false && r.timestampRaw && r.responsavel === resp && r.timestampRaw.toDate() >= dataLimite);
            });
        });

        const limiteProducao = computed(() => visaoMetas.value === 'mensal' ? metas.producaoMensal : metas.producaoAnual);
        const limiteEstoque = computed(() => visaoMetas.value === 'mensal' ? metas.estoqueMensal : metas.estoqueAnual);
        const totalProducao = computed(() => registros.value.filter(r => r.local === 'Produção').reduce((acc, r) => acc + (r.quantidade || 1), 0));
        const totalEstoque = computed(() => registros.value.filter(r => r.local === 'Estoque').reduce((acc, r) => acc + (r.quantidade || 1), 0));
        const percentualProducao = computed(() => limiteProducao.value > 0 ? (totalProducao.value / limiteProducao.value) * 100 : 0);
        const percentualEstoque = computed(() => limiteEstoque.value > 0 ? (totalEstoque.value / limiteEstoque.value) * 100 : 0);
        const historicoFiltrado = computed(() => registros.value.filter(reg => reg.local === abaHistorico.value && (filtros.causa === '' || reg.causa === filtros.causa) && (filtros.responsavel === '' || reg.responsavel === filtros.responsavel)));

        const renderizarGraficoEvolucao = () => {
            const ctx = document.getElementById('evolucaoChart');
            if (!ctx) return;
            if (chartInstance.value) chartInstance.value.destroy();
            
            const agrupamentoPorMes = {};
            [...registros.value].reverse().forEach(reg => {
                if(!reg.timestampRaw) return;
                const d = reg.timestampRaw.toDate(); const mesAno = `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
                if (!agrupamentoPorMes[mesAno]) agrupamentoPorMes[mesAno] = { producao: 0, estoque: 0 };
                if (reg.local === 'Produção') agrupamentoPorMes[mesAno].producao += (reg.quantidade || 1);
                else if (reg.local === 'Estoque') agrupamentoPorMes[mesAno].estoque += (reg.quantidade || 1);
            });
            const mesesLabels = Object.keys(agrupamentoPorMes);
            const nomesMeses = {'01':'Jan', '02':'Fev', '03':'Mar', '04':'Abr', '05':'Mai', '06':'Jun', '07':'Jul', '08':'Ago', '09':'Set', '10':'Out', '11':'Nov', '12':'Dez'};
            const bgProducao = mesesLabels.map(m => agrupamentoPorMes[m].producao > metas.producaoMensal ? '#ef4444' : '#10b981');
            const bgEstoque = mesesLabels.map(m => agrupamentoPorMes[m].estoque > metas.estoqueMensal ? '#ef4444' : '#10b981');
            const tc = isDarkMode.value ? '#94a3b8' : '#64748b'; const gc = isDarkMode.value ? '#334155' : '#f1f5f9';

            const labelsFormatadas = mesesLabels.map(ma => {
                const mesNum = ma.split('/')[0];
                const anoCurto = ma.split('/')[1].substring(2);
                return `${nomesMeses[mesNum]}/${anoCurto}`;
            });

            const pluginTitulosEmbaixoDasBarras = {
                id: 'titulosEmbaixoDasBarras',
                afterDatasetsDraw(chart) {
                    const { ctx, scales: { x, y } } = chart;
                    ctx.save();
                    ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = isDarkMode.value ? '#cbd5e1' : '#64748b';
                    chart.data.datasets.forEach((dataset, i) => {
                        const meta = chart.getDatasetMeta(i);
                        if (!meta.hidden) {
                            meta.data.forEach((bar) => {
                                const label = dataset.label === 'Produção' ? 'PROD' : 'EST';
                                ctx.fillText(label, bar.x, y.bottom + 6); 
                            });
                        }
                    });
                    ctx.restore();
                }
            };

            chartInstance.value = new Chart(ctx, { 
                type: 'bar', 
                data: { labels: labelsFormatadas, datasets: [{ label: 'Produção', data: mesesLabels.map(m => agrupamentoPorMes[m].producao), backgroundColor: bgProducao, borderRadius: 4 }, { label: 'Estoque', data: mesesLabels.map(m => agrupamentoPorMes[m].estoque), backgroundColor: bgEstoque, borderRadius: 4 }] }, 
                options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { color: tc, font: { weight: 'bold' }, padding: 22 }, grid: { color: gc, drawBorder: false } }, y: { ticks: { color: tc }, grid: { color: gc, drawBorder: false } } }, plugins: { legend: { labels: { color: tc } } } },
                plugins: [pluginTitulosEmbaixoDasBarras]
            });
        };

        watch(currentTab, (newTab) => { if (newTab === 'dashboard') { setTimeout(renderizarGraficoEvolucao, 350); } });

        return {
            usuarioLogado, loginForm, erroLogin, fazerLogin, fazerLogout, salvarSessao, currentTab, menuMobileAberto, mudarAba, carregando, isDarkMode, toggleTheme, regraAtiva, salvarRegra, form, salvarRegistro, mensagemSucesso, modalEdicao, abrirEdicao, salvarEdicao, visaoMetas, metas, salvarConfiguracoes, totalProducao, totalEstoque, percentualProducao, percentualEstoque, limiteProducao, limiteEstoque,
            registros, abaHistorico, filtros, historicoFiltrado, limparFiltros, deletarRegistro, listaCausas, novaCausa, adicionarCausa, removerCausa, listaResponsaveis, 
            novoColaboradorNome, novoColaboradorFabrica, adicionarColaborador, removerColaborador, statusEquipe, destaquesEquipe, modalRaioX, abrirRaioX, modalSenha, abrirModalSenha, alterarSenha, colaboradoresDaFabricaAtual
        }
    }
}).mount('#app')
