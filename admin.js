import { createApp, ref, reactive, computed, watch, onMounted } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import { db } from './firebase-config.js'; 
import { collection, addDoc, onSnapshot, query, deleteDoc, doc, getDocs, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

createApp({
    setup() {
        const currentTab = ref('dashboard');
        const usuarios = ref([]);
        const registros = ref([]);
        const modalAberto = ref(false);
        const modoEdicao = ref(false);
        const idUsuarioEdicao = ref(null);
        const chartInstance = ref(null);

        const form = reactive({
            nome: '',
            email: '',
            senha: '',
            nivelAcesso: '',
            fabricas: []
        });

        onMounted(() => {
            document.documentElement.classList.toggle('dark', localStorage.getItem('qc_theme') === 'dark');

            // 1. Monitorar Usuários Cadastrados
            const qUsuarios = query(collection(db, "usuarios"));
            onSnapshot(qUsuarios, (snapshot) => {
                const lista = [];
                snapshot.forEach((docSnap) => { 
                    lista.push({ id: docSnap.id, ...docSnap.data() }); 
                });
                usuarios.value = lista;

                // PROTEÇÃO DE ROTA
                if (lista.length > 0) {
                    const loggedUser = JSON.parse(localStorage.getItem('qc_user'));
                    if (!loggedUser || loggedUser.nivelAcesso !== 'Coordenador') {
                        alert("Acesso Restrito! Apenas Coordenadores podem acessar o Painel de Administração.");
                        window.location.href = 'index.html';
                    }
                }
            });

            // 2. Monitorar Registros Gerais
            const qRegistros = query(collection(db, "registros"));
            onSnapshot(qRegistros, (snapshot) => {
                const listaReg = [];
                snapshot.forEach((docSnap) => { listaReg.push(docSnap.data()); });
                registros.value = listaReg;
                if(currentTab.value === 'dashboard') setTimeout(renderizarGrafico, 300);
            });
        });

        // Função para abrir modal CRIANDO novo usuário
        const abrirModalUsuario = () => {
            modoEdicao.value = false;
            idUsuarioEdicao.value = null;
            form.nome = ''; form.email = ''; form.senha = ''; form.nivelAcesso = ''; form.fabricas = [];
            modalAberto.value = true;
        };

        // Função para abrir modal EDITANDO usuário existente
        const abrirEdicaoUsuario = (user) => {
            modoEdicao.value = true;
            idUsuarioEdicao.value = user.id;
            form.nome = user.nome;
            form.email = user.email;
            form.senha = ''; // Deixa vazio. Se o admin não digitar nada, a senha antiga é mantida.
            form.nivelAcesso = user.nivelAcesso;
            form.fabricas = [...(user.fabricas || [])];
            modalAberto.value = true;
        };

        const salvarUsuario = async () => {
            if (form.fabricas.length === 0) {
                alert("O usuário precisa ser vinculado a pelo menos uma fábrica.");
                return;
            }

            try {
                if (modoEdicao.value) {
                    // MODO ATUALIZAÇÃO
                    const dadosAtualizados = {
                        nome: form.nome,
                        email: form.email,
                        nivelAcesso: form.nivelAcesso,
                        fabricas: [...form.fabricas]
                    };
                    
                    // Só atualiza a senha no banco se o admin digitou uma senha nova
                    if (form.senha.trim() !== '') {
                        dadosAtualizados.senha = form.senha;
                    }

                    await updateDoc(doc(db, "usuarios", idUsuarioEdicao.value), dadosAtualizados);
                } else {
                    // MODO CRIAÇÃO
                    await addDoc(collection(db, "usuarios"), {
                        nome: form.nome,
                        email: form.email,
                        senha: form.senha, 
                        nivelAcesso: form.nivelAcesso,
                        fabricas: [...form.fabricas],
                        criadoEm: new Date()
                    });
                }
                modalAberto.value = false;
            } catch (error) {
                console.error("Erro ao salvar usuário:", error);
            }
        };

        const deletarUsuario = async (id) => {
            if(confirm("Tem certeza que deseja revogar o acesso deste usuário permanentemente?")) {
                await deleteDoc(doc(db, "usuarios", id));
            }
        };

        // Função de Migração de Dados
        const migrarDadosAntigos = async () => {
            if(!confirm("Isso vai mover todos os apontamentos sem fábrica definida para a Fábrica 2. Deseja continuar?")) return;
            try {
                const q = query(collection(db, "registros"));
                const snapshot = await getDocs(q);
                let atualizados = 0;
                const promessas = [];

                snapshot.forEach((documento) => {
                    const dado = documento.data();
                    if (!dado.fabrica || dado.fabrica !== 'Fábrica 2') {
                        promessas.push(updateDoc(doc(db, "registros", documento.id), { fabrica: 'Fábrica 2' }));
                        atualizados++;
                    }
                });

                await Promise.all(promessas);
                alert(`Migração concluída com sucesso! ${atualizados} apontamentos foram movidos para a Fábrica 2.`);
            } catch (error) {
                console.error(error);
                alert("Erro ao tentar migrar os dados.");
            }
        };

        const totalFabrica1 = computed(() => registros.value.filter(r => r.fabrica === 'Fábrica 1').reduce((acc, r) => acc + (r.quantidade || 1), 0));
        const totalFabrica2 = computed(() => registros.value.filter(r => r.fabrica === 'Fábrica 2').reduce((acc, r) => acc + (r.quantidade || 1), 0));

        const renderizarGrafico = () => {
            const ctx = document.getElementById('adminChart');
            if (!ctx) return;
            if (chartInstance.value) chartInstance.value.destroy();

            const causasCountF1 = {}; const causasCountF2 = {};

            registros.value.forEach(reg => {
                const causa = reg.causa || 'Não informada';
                const qtd = reg.quantidade || 1;
                if (reg.fabrica === 'Fábrica 1') causasCountF1[causa] = (causasCountF1[causa] || 0) + qtd;
                else if (reg.fabrica === 'Fábrica 2') causasCountF2[causa] = (causasCountF2[causa] || 0) + qtd;
            });

            const labelsUnicos = [...new Set([...Object.keys(causasCountF1), ...Object.keys(causasCountF2)])];
            const dataF1 = labelsUnicos.map(label => causasCountF1[label] || 0);
            const dataF2 = labelsUnicos.map(label => causasCountF2[label] || 0);

            const isDarkMode = localStorage.getItem('qc_theme') === 'dark';
            const textColor = isDarkMode ? '#94a3b8' : '#64748b';
            const gridColor = isDarkMode ? '#334155' : '#f1f5f9';

            chartInstance.value = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labelsUnicos,
                    datasets: [
                        { label: 'Fábrica 1', data: dataF1, backgroundColor: '#4f46e5', borderRadius: 4 },
                        { label: 'Fábrica 2', data: dataF2, backgroundColor: '#e11d48', borderRadius: 4 }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    scales: { x: { ticks: { color: textColor }, grid: { color: gridColor, drawBorder: false } }, y: { ticks: { color: textColor }, grid: { color: gridColor, drawBorder: false } } },
                    plugins: { legend: { position: 'top', labels: { color: textColor } } }
                }
            });
        };

        watch(currentTab, (newTab) => { if (newTab === 'dashboard') setTimeout(renderizarGrafico, 300); });

        return {
            currentTab, usuarios, registros, modalAberto, modoEdicao, form,
            abrirModalUsuario, abrirEdicaoUsuario, salvarUsuario, deletarUsuario, migrarDadosAntigos,
            totalFabrica1, totalFabrica2
        }
    }
}).mount('#admin-app');
