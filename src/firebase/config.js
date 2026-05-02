import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore"; // ← ADD THIS

const firebaseConfig = {
  apiKey: "AIzaSyDwxdT1uWHQugaEAwUZaBjbJg648jLQ254",
  authDomain: "buscaro-route-planner.firebaseapp.com",
  projectId: "buscaro-route-planner",
  storageBucket: "buscaro-route-planner.firebasestorage.app",
  messagingSenderId: "1044244610595",
  appId: "1:1044244610595:web:79b496e715b88b69a2bb96",
  measurementId: "G-TP7PLJ2LN5"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const db = getFirestore(app); // ← ADD THIS