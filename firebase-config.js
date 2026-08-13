import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";

import {
    initializeFirestore
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

import {
    getStorage
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyAj_42L__UDXgVQmJRW-sxQPcCyWQh_4Mk",
    authDomain: "wba-member-portal-1925e.firebaseapp.com",
    projectId: "wba-member-portal-1925e",
    storageBucket: "wba-member-portal-1925e.firebasestorage.app",
    messagingSenderId: "743489647531",
    appId: "1:743489647531:web:11c6a570c5eef67d13d8ee"
};


const firebaseApp = initializeApp(firebaseConfig);

const db = initializeFirestore(firebaseApp, {
    experimentalForceLongPolling: true
});

const storage =
    getStorage(firebaseApp);

export {
    firebaseApp,
    db,
    storage
};