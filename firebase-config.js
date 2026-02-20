// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// COLE SUAS CREDENCIAIS AQUI

const firebaseConfig = {
  apiKey: "AIzaSyA1nLTZUEs-l6RRgfhOyzx4X1itlmOgZas",
  authDomain: "controle-etiquetas-b915e.firebaseapp.com",
  projectId: "controle-etiquetas-b915e",
  storageBucket: "controle-etiquetas-b915e.firebasestorage.app",
  messagingSenderId: "400527007875",
  appId: "1:400527007875:web:4bed589a7ef5d82b373bb6"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);