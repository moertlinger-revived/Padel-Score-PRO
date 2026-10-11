// ⚠️ REEMPLAZA ESTO con TU configuración de Firebase (Fase 2.3)
const firebaseConfig = {
    apiKey: "AIzaSyCtL2H29SfIxyMB5cJmRLiV7Yz6fMrh5cA",
    authDomain: "padel-score-pro-c5be0.firebaseapp.com",
    databaseURL: "https://padel-score-pro-c5be0-default-rtdb.firebaseio.com",
    projectId: "padel-score-pro-c5be0",
    storageBucket: "padel-score-pro-c5be0.firebasestorage.app",
    messagingSenderId: "552057658918",
    appId: "1:552057658918:web:d43347aebc5eb02d2110e7"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();