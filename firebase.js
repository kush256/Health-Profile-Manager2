// Firebase SDK
import { initializeApp } from
"https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";

import {
getAuth
} from
"https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
getFirestore
} from
"https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBPQCNMMWQzEj2Jaj0c5Rx6bGOQIe6nxk8",
  authDomain: "health-profile-manager.firebaseapp.com",
  projectId: "health-profile-manager",
  storageBucket: "health-profile-manager.firebasestorage.app",
  messagingSenderId: "743830468484",
  appId: "1:743830468484:web:7d25fb3966c49964104fd1"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const db = getFirestore(app);
