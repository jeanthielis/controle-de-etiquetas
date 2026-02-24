# 🏭 QualiTrack - Sistema de Gestão de Qualidade Operacional

O **QualiTrack** é uma aplicação web moderna e responsiva desenvolvida para o controle e acompanhamento de apontamentos de qualidade no chão de fábrica. O sistema permite registrar desvios (perdas de etiquetas), acompanhar metas de produção/estoque, e realizar a Gestão de Consequências e Gamificação da equipe operacional em tempo real.

![Vue.js](https://img.shields.io/badge/Vue.js-3.0-4FC08D?style=for-the-badge&logo=vue.js)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.0-38B2AC?style=for-the-badge&logo=tailwind-css)
![Firebase](https://img.shields.io/badge/Firebase-Firestore-FFCA28?style=for-the-badge&logo=firebase)
![Chart.js](https://img.shields.io/badge/Chart.js-Gráficos-FF6384?style=for-the-badge&logo=chart.js)

---

## ✨ Principais Funcionalidades

- **Múltiplas Fábricas:** Suporte para gestão paralela de múltiplas unidades (ex: Fábrica 1 e Fábrica 2), isolando os dados conforme o acesso do usuário.
- **Dashboards Analíticos:** Visualização de metas mensais e anuais de Produção e Estoque com gráficos de evolução temporal.
- **Gestão de Consequências:** Inteligência automatizada que calcula advertências (Verbal ou Escrita) baseada no acúmulo de falhas do colaborador nos últimos 60 dias.
- **Gamificação (Reconhecimento):** Mural automático destacando colaboradores que estão há mais de 60 dias com "Zero Ocorrências".
- **Painel de Controle:** Gestão dinâmica de Motivos de Falha, Metas e Quadro Operacional.
- **Painel Administrativo (AdminTrack):** Visão macro da operação e gestão completa de usuários e permissões.
- **Dark Mode:** Suporte nativo para Modo Escuro/Claro, salvando a preferência do dispositivo.

---

## 🔐 Níveis de Acesso

O sistema possui um controle de rotas rigoroso baseado no nível do colaborador logado:

| Nível | Permissões |
| :--- | :--- |
| **Técnico** | Pode registrar novos apontamentos e visualizar o Dashboard da sua respectiva fábrica. |
| **Supervisor** | Permissões do Técnico + Acesso à aba de Histórico, edição/exclusão de registros, visualização da Gestão de Consequências e Painel de Controle de sua respectiva fábrica. |
| **Coordenador** | Acesso total. Pode transitar entre os dados de todas as fábricas e tem acesso exclusivo ao **Menu de Administração** para criar novos usuários e redefinir senhas. |

---

## 📂 Estrutura do Projeto

O projeto foi construído utilizando tecnologias modernas acessadas via CDN (sem necessidade de Node.js/NPM local), facilitando a hospedagem em qualquer servidor estático.

```text
/
├── index.html           # Interface principal do aplicativo (Login, Dashboard, Lançamentos)
├── app.js               # Lógica principal (Vue 3) e integração com Firestore da aplicação
├── admin.html           # Interface exclusiva do Painel Administrativo (Visão Global)
├── admin.js             # Lógica de gestão de usuários e gráficos consolidados globais
├── firebase-config.js   # Arquivo de conexão contendo as chaves do Firebase
└── README.md            # Documentação do projeto
