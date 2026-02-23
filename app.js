import { createApp, ref, reactive, computed, watch, nextTick, onMounted } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import { db } from './firebase-config.js'; 
// IMPORTANTE: Adicionado setDoc para salvar as configurações
import { collection, addDoc, onSnapshot, query, updateDoc, deleteDoc, doc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const gerarDataAtualInput = () => {
    const agora = new Date();
    const offset = agora.getTimezoneOffset() * 60000;
    return new Date(agora.getTime() - offset).toISOString().slice(0, 16);
};

createApp({
    setup() {
        const currentTab = ref('dashboard');
        const menuMobileAberto = ref(false);
        const mensagemSucesso = ref(false);
        const visaoMetas = ref('mensal'); 
        const abaHistorico = ref('Produção');
        const carregando = ref(true);
        const chartInstance = ref(null);

        // Dark Mode: Mantido no localStorage propositalmente (é uma preferência de tela do dispositivo do usuário, não da empresa)
        const isDarkMode = ref(localStorage.getItem('qc_theme') === 'dark');
        const toggleTheme = () => {
            isDarkMode.value = !isDarkMode.value;
            localStorage.setItem('qc_theme', isDarkMode.value ? 'dark' : 'light');
            aplicarTema();
            if (currentTab.value === 'dashboard') setTimeout(() => renderizarGraficoEvolucao(), 50);
        };
        const aplicarTema = () => document.documentElement.classList.toggle('dark', isDarkMode.value);

        // Variáveis de Configuração (agora vazias por padrão, serão preenchidas pelo Firebase)
        const regraAtiva = ref(true);
        const metas = reactive({ producaoMensal: 0, producaoAnual: 0, estoqueMensal: 0, estoqueAnual: 0 });
        const listaCausas = ref([]);
        const listaResponsaveis = ref([]);

        // Formulários e Filtros
        const filtros = reactive({ causa: '', responsavel: '' });
        const form = reactive({ local: '', causa: '', responsavel: '', quantidade: 1, dataOcorrencia: gerarDataAtualInput() });
        const registros = ref([]);
        const modalEdicao = reactive({ aberto: false, id: null, local: '', causa: '', responsavel: '', quantidade: 1, dataOcorrencia: '' });

        const novaCausa = ref('');
        const novoColaborador = ref('');

        // =========================================================================
        // FUNÇÃO DE SALVAMENTO NO FIREBASE (Substitui o LocalStorage)
        // =========================================================================
        const salvarConfiguracoes = async () => {
            try {
                // Salva todos os parâmetros no documento 'geral' da coleção 'configuracoes'
                await setDoc(doc(db, "configuracoes", "geral"), {
                    regraAtiva: regraAtiva.value,
                    metas: { ...metas },
                    causas: listaCausas.value,
                    responsaveis: listaResponsaveis.value
                }, { merge: true }); // Merge true evita apagar outros dados acidentalmente
                
                if (currentTab.value === 'dashboard') setTimeout(() => renderizarGraficoEvolucao(), 50);
            } catch (e) {
                console.error("Erro ao salvar configurações no Firebase:", e);
            }
        };

        const salvarRegra = () => salvarConfiguracoes();

        const adicionarCausa = () => { 
            if(novaCausa.value.trim()){ 
                listaCausas.value.push(novaCausa.value.trim()); 
                novaCausa.value = ''; 
                salvarConfiguracoes(); 
            } 
        };
        const removerCausa = (index) => { listaCausas.value.splice(index, 1); salvarConfiguracoes(); };
        
        const adicionarColaborador = () => { 
            if(novoColaborador.value.trim()){ 
                listaResponsaveis.value.push(novoColaborador.value.trim()); 
                novoColaborador.value = ''; 
                salvarConfiguracoes(); 
            } 
        };
        const removerColaborador = (index) => { listaResponsaveis.value.splice(index, 1); salvarConfiguracoes(); };

        // =========================================================================
        // BUSCA NO FIREBASE (Registros + Configurações)
        // =========================================================================
        onMounted(() => {
            aplicarTema();
            
            // 1. Monitorar as Configurações em Tempo Real
            const docConfig = doc(db, "configuracoes", "geral");
            onSnapshot(docConfig, (snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.data();
                    if (data.regraAtiva !== undefined) regraAtiva.value = data.regraAtiva;
                    if (data.metas) Object.assign(metas, data.metas);
                    if (data.causas) listaCausas.value = data.causas;
                    if (data.responsaveis) listaResponsaveis.value = data.responsaveis;
                } else {
                    // Se o documento não existir (primeira vez abrindo o app no Firebase), cria ele
                    salvarConfiguracoes();
                }
            });

            // 2. Monitorar os Registros
            const q = query(collection(db, "registros"));
            onSnapshot(q, (snapshot) => {
                const dadosMapeados = [];
                
                snapshot.forEach((doc) => {
                    const dado = doc.data();
                    let dataFormatada = 'Sem data';
                    let timestampRaw = dado.timestamp || null;
                    let tempoMilisegundos = 0; 
                    
                    if(timestampRaw) {
                        const dataObj = timestampRaw.toDate();
                        tempoMilisegundos = dataObj.getTime();
                        dataFormatada = `${dataObj.getDate().toString().padStart(2, '0')}/${(dataObj.getMonth()+1).toString().padStart(2, '0')}/${dataObj.getFullYear()} ${dataObj.getHours().toString().padStart(2, '0')}:${dataObj.getMinutes().toString().padStart(2, '0')}`;
                    }

                    dadosMapeados.push({
                        id: doc.id, 
                        local: dado.local || 'Indefinido', 
                        causa: dado.causa || 'Indefinido', 
                        responsavel: dado.responsavel || 'Indefinido',
                        quantidade: dado.quantidade || 1, 
                        dataHoraFormatada: dataFormatada, 
                        timestampRaw: timestampRaw,
                        ordenacaoTempo: tempoMilisegundos
                    });
                });

                dadosMapeados.sort((a, b) => b.ordenacaoTempo - a.ordenacaoTempo);
                registros.value = dadosMapeados;
                carregando.value = false;
                
                if(currentTab.value === 'dashboard') setTimeout(() => renderizarGraficoEvolucao(), 350);
            });
        });

        // =========================================================================
        // LÓGICA EXISTENTE DO APP (Sem alterações abaixo)
        // =========================================================================
        const mudarAba = (aba) => { currentTab.value = aba; menuMobileAberto.value = false; };
        const limparFiltros = () => { filtros.causa = ''; filtros.responsavel = ''; };

        const salvarRegistro = async () => {
            try {
                const dataRegistro = new Date(form.dataOcorrencia);
                await addDoc(collection(db, "registros"), {
                    local: form.local, 
                    causa: form.causa, 
                    responsavel: form.responsavel, 
                    quantidade: form.quantidade, 
                    timestamp: dataRegistro 
                });
                
                form.local = ''; form.causa = ''; form.responsavel = ''; form.quantidade = 1; 
                form.dataOcorrencia = gerarDataAtualInput(); 
                
                mensagemSucesso.value = true;
                setTimeout(() => { mensagemSucesso.value = false; }, 2000);
            } catch (e) { console.error("Erro ao salvar: ", e); }
        };

        const deletarRegistro = async (id) => {
            if(confirm("Deseja realmente excluir este registro?")) await deleteDoc(doc(db, "registros", id));
        };

        const abrirEdicao = (reg) => {
            modalEdicao.id = reg.id; 
            modalEdicao.local = reg.local; 
            modalEdicao.causa = reg.causa;
            modalEdicao.responsavel = reg.responsavel; 
            modalEdicao.quantidade = reg.quantidade;
            
            if(reg.timestampRaw) {
                const d = reg.timestampRaw.toDate();
                const offset = d.getTimezoneOffset() * 60000;
                modalEdicao.dataOcorrencia = new Date(d.getTime() - offset).toISOString().slice(0, 16);
            } else { 
                modalEdicao.dataOcorrencia = gerarDataAtualInput(); 
            }
            modalEdicao.aberto = true;
        };

        const salvarEdicao = async () => {
            try {
                await updateDoc(doc(db, "registros", modalEdicao.id), {
                    local: modalEdicao.local, 
                    causa: modalEdicao.causa, 
                    responsavel: modalEdicao.responsavel,
                    quantidade: modalEdicao.quantidade, 
                    timestamp: new Date(modalEdicao.dataOcorrencia)
                });
                modalEdicao.aberto = false;
            } catch (e) { console.error("Erro ao editar: ", e); }
        };

        const statusEquipe = computed(() => {
            const dataLimite = new Date();
            dataLimite.setDate(dataLimite.getDate() - 60);

            return listaResponsaveis.value.map(resp => {
                const registrosRecentes = registros.value.filter(r => {
                    if (!r.timestampRaw) return false;
                    return r.responsavel === resp && r.timestampRaw.toDate() >= dataLimite;
                });

                let total = 0;
                let erroDeVez = false;

                registrosRecentes.forEach(r => {
                    const qtd = r.quantidade || 1;
                    total += qtd;
                    if (qtd >= 3) erroDeVez = true; 
                });

                let status = "Sem advertência";
                let cor = "text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800";

                if (erroDeVez || total >= 3) {
                    status = "Advertência Escrita";
                    cor = "text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 border-rose-300 dark:border-rose-800";
                } else if (total === 2) {
                    status = "Advertência Verbal";
                    cor = "text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 border-orange-300 dark:border-orange-800";
                }
                return { nome: resp, total, status, cor };
            }).sort((a, b) => b.total - a.total);
        });

        const registrosFiltradosPorVisao = computed(() => {
            const dataAtual = new Date();
            const mesAtual = dataAtual.getMonth();
            const anoAtual = dataAtual.getFullYear();

            return registros.value.filter(r => {
                if (!r.timestampRaw) return false;
                const dataRegistro = r.timestampRaw.toDate();
                
                if (visaoMetas.value === 'mensal') {
                    return dataRegistro.getMonth() === mesAtual && dataRegistro.getFullYear() === anoAtual;
                } else {
                    return dataRegistro.getFullYear() === anoAtual;
                }
            });
        });

        const limiteProducao = computed(() => visaoMetas.value === 'mensal' ? metas.producaoMensal : metas.producaoAnual);
        const limiteEstoque = computed(() => visaoMetas.value === 'mensal' ? metas.estoqueMensal : metas.estoqueAnual);

        const totalProducao = computed(() => registrosFiltradosPorVisao.value.filter(r => r.local === 'Produção').reduce((acc, r) => acc + (r.quantidade || 1), 0));
        const totalEstoque = computed(() => registrosFiltradosPorVisao.value.filter(r => r.local === 'Estoque').reduce((acc, r) => acc + (r.quantidade || 1), 0));
        
        const percentualProducao = computed(() => limiteProducao.value > 0 ? (totalProducao.value / limiteProducao.value) * 100 : 0);
        const percentualEstoque = computed(() => limiteEstoque.value > 0 ? (totalEstoque.value / limiteEstoque.value) * 100 : 0);

        const historicoFiltrado = computed(() => {
            return registros.value.filter(reg => {
                return reg.local === abaHistorico.value && 
                       (filtros.causa === '' || reg.causa === filtros.causa) && 
                       (filtros.responsavel === '' || reg.responsavel === filtros.responsavel);
            });
        });

        const renderizarGraficoEvolucao = () => {
            const ctx = document.getElementById('evolucaoChart');
            if (!ctx) return;
            if (chartInstance.value) chartInstance.value.destroy();

            const agrupamentoPorMes = {};
            
            [...registros.value].reverse().forEach(reg => {
                if(!reg.timestampRaw) return;
                const d = reg.timestampRaw.toDate();
                const mesAno = `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
                const qtd = reg.quantidade || 1;
                
                if (!agrupamentoPorMes[mesAno]) agrupamentoPorMes[mesAno] = { producao: 0, estoque: 0 };
                if (reg.local === 'Produção') agrupamentoPorMes[mesAno].producao += qtd;
                else if (reg.local === 'Estoque') agrupamentoPorMes[mesAno].estoque += qtd;
            });

            const mesesLabels = Object.keys(agrupamentoPorMes);
            const nomesMeses = {'01':'Jan','02':'Fev','03':'Mar','04':'Abr','05':'Mai','06':'Jun','07':'Jul','08':'Ago','09':'Set','10':'Out','11':'Nov','12':'Dez'};
            const labelsLegiveis = mesesLabels.map(ma => `${nomesMeses[ma.split('/')[0]]}/${ma.split('/')[1].substring(2)}`);

            const colorirColuna = (valor, limite) => {
                if (limite <= 0) return '#64748b'; 
                return valor > limite ? '#ef4444' : '#10b981';
            };

            const bgProducao = mesesLabels.map(m => colorirColuna(agrupamentoPorMes[m].producao, metas.producaoMensal));
            const bgEstoque = mesesLabels.map(m => colorirColuna(agrupamentoPorMes[m].estoque, metas.estoqueMensal));

            const textColor = isDarkMode.value ? '#94a3b8' : '#64748b';
            const gridColor = isDarkMode.value ? '#334155' : '#f1f5f9';

            chartInstance.value = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labelsLegiveis,
                    datasets: [
                        { label: 'Produção', data: mesesLabels.map(m => agrupamentoPorMes[m].producao), backgroundColor: bgProducao, borderRadius: 4 },
                        { label: 'Estoque', data: mesesLabels.map(m => agrupamentoPorMes[m].estoque), backgroundColor: bgEstoque, borderRadius: 4 }
                    ]
                },
                options: { 
                    responsive: true, maintainAspectRatio: false, animation: { duration: 800 },
                    scales: {
                        x: { ticks: { color: textColor }, grid: { color: gridColor, drawBorder: false } },
                        y: { ticks: { color: textColor }, grid: { color: gridColor, drawBorder: false } }
                    },
                    plugins: { legend: { labels: { color: textColor } } }
                }
            });
        };

        watch(currentTab, (newTab) => { 
            if (newTab === 'dashboard') { setTimeout(() => renderizarGraficoEvolucao(), 350); } 
        });

        return {
            currentTab, menuMobileAberto, mudarAba, carregando, isDarkMode, toggleTheme, regraAtiva, salvarRegra,
            form, salvarRegistro, mensagemSucesso, modalEdicao, abrirEdicao, salvarEdicao,
            visaoMetas, metas, salvarConfiguracoes, 
            totalProducao, totalEstoque, percentualProducao, percentualEstoque, limiteProducao, limiteEstoque,
            registros, abaHistorico, filtros, historicoFiltrado, limparFiltros, deletarRegistro,
            listaCausas, novaCausa, adicionarCausa, removerCausa,
            listaResponsaveis, novoColaborador, adicionarColaborador, removerColaborador, statusEquipe
        }
    }
}).mount('#app')
