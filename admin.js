import { createApp, ref, reactive, computed, watch, onMounted } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import { db } from './firebase-config.js'; 
import { collection, addDoc, onSnapshot, query, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

createApp({
    setup() {
        const currentTab = ref('dashboard');
        const usuarios = ref([]);
        const registros = ref([]);
        const modalAberto = ref(false);
        const chartInstance = ref(null);

        // Formulário para novo usuário
        const form = reactive({
            nome: '',
            email: '',
            senha: '',
            fabricas: []
        });

        onMounted(() => {
            // 1. Monitorar Usuários Cadastrados
            const qUsuarios = query(collection(db, "usuarios"));
            onSnapshot(qUsuarios, (snapshot) => {
                const lista = [];
                snapshot.forEach((doc) => {
                    lista.push({ id: doc.id, ...doc.data() });
                });
                usuarios.value = lista;
            });

            // 2. Monitorar Registros Gerais (Para o Dashboard)
            const qRegistros = query(collection(db, "registros"));
            onSnapshot(qRegistros, (snapshot) => {
                const listaReg = [];
                snapshot.forEach((doc) => {
                    listaReg.push(doc.data());
                });
                registros.value = listaReg;
                if(currentTab.value === 'dashboard') setTimeout(renderizarGrafico, 300);
            });
        });

        const abrirModalUsuario = () => {
            form.nome = ''; form.email = ''; form.senha = ''; form.fabricas = [];
            modalAberto.value = true;
        };

        // Salvar usuário no Firestore
        const salvarUsuario = async () => {
            if (form.fabricas.length === 0) {
                alert("O usuário precisa ser vinculado a pelo menos uma fábrica.");
                return;
            }

            try {
                await addDoc(collection(db, "usuarios"), {
                    nome: form.nome,
                    email: form.email,
                    senha: form.senha, // Obs: Em um app de produção, usaríamos Firebase Auth para criptografar
                    fabricas: [...form.fabricas],
                    criadoEm: new Date()
                });
                modalAberto.value = false;
            } catch (error) {
                console.error("Erro ao cadastrar usuário:", error);
            }
        };

        const deletarUsuario = async (id) => {
            if(confirm("Tem certeza que deseja revogar o acesso deste usuário?")) {
                await deleteDoc(doc(db, "usuarios", id));
            }
        };

        // Cálculos do Dashboard Admin
        const totalFabrica1 = computed(() => {
            return registros.value.filter(r => r.fabrica === 'Fábrica 1').reduce((acc, r) => acc + (r.quantidade || 1), 0);
        });

        const totalFabrica2 = computed(() => {
            return registros.value.filter(r => r.fabrica === 'Fábrica 2').reduce((acc, r) => acc + (r.quantidade || 1), 0);
        });

        const renderizarGrafico = () => {
            const ctx = document.getElementById('adminChart');
            if (!ctx) return;
            if (chartInstance.value) chartInstance.value.destroy();

            // Lógica simples para agrupar as causas principais das duas fábricas
            const causasCountF1 = {};
            const causasCountF2 = {};

            registros.value.forEach(reg => {
                const causa = reg.causa || 'Não informada';
                const qtd = reg.quantidade || 1;
                
                if (reg.fabrica === 'Fábrica 1') {
                    causasCountF1[causa] = (causasCountF1[causa] || 0) + qtd;
                } else if (reg.fabrica === 'Fábrica 2') {
                    causasCountF2[causa] = (causasCountF2[causa] || 0) + qtd;
                }
            });

            // Extrair rótulos únicos
            const labelsUnicos = [...new Set([...Object.keys(causasCountF1), ...Object.keys(causasCountF2)])];

            const dataF1 = labelsUnicos.map(label => causasCountF1[label] || 0);
            const dataF2 = labelsUnicos.map(label => causasCountF2[label] || 0);

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
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'top' } }
                }
            });
        };

        watch(currentTab, (newTab) => {
            if (newTab === 'dashboard') setTimeout(renderizarGrafico, 300);
        });

        return {
            currentTab, usuarios, registros, modalAberto, form,
            abrirModalUsuario, salvarUsuario, deletarUsuario,
            totalFabrica1, totalFabrica2
        }
    }
}).mount('#admin-app');
