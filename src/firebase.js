import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyD_ctPPEDTV8iQJ4MAwL4A2FlIHhC-ujs0",
    authDomain: "mrovere-fire.firebaseapp.com",
    projectId: "mrovere-fire",
    storageBucket: "mrovere-fire.firebasestorage.app",
    messagingSenderId: "47769290906",
    appId: "1:47769290906:web:128d1c0956af6d526d3723",
    measurementId: "G-8LP1NM8LVN"
};

const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

export {
  auth,
  db,
  browserLocalPersistence,
  collection,
  doc,
  getDoc,
  getDocs,
  onAuthStateChanged,
  orderBy,
  query,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
};
