importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyAlkY_-xWPzop1Lg4-PQj_hqOkevwIsRzE",
    authDomain: "roman-website.firebaseapp.com",
    projectId: "roman-website",
    messagingSenderId: "358696108775",
    appId: "1:358696108775:web:bf340c26129775158f1842"
});

// Pesan dengan blok "notification" otomatis ditampilkan oleh FCM,
// jadi cukup inisialisasi messaging di sini.
firebase.messaging();
