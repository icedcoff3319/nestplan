import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  reload,
  sendPasswordResetEmail,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const productionFirebaseConfig = {
  apiKey: "AIzaSyACXGeCcSIbP5WM2J10d1xp-BNTmlMpbLI",
  authDomain: "nestplan-863e5.firebaseapp.com",
  projectId: "nestplan-863e5",
  storageBucket: "nestplan-863e5.firebasestorage.app",
  messagingSenderId: "48521832374",
  appId: "1:48521832374:web:1e82e78a1edafae31e0317"
};

const stagingFirebaseConfig = window.__nestplanStagingFirebaseConfig || null;

function resolveFirebaseEnvironment() {
  const params = new URLSearchParams(window.location.search);
  const requestedEnv = (params.get("env") || "").toLowerCase();
  const host = window.location.hostname.toLowerCase();
  if (
    requestedEnv === "staging"
    || host === "localhost"
    || host === "127.0.0.1"
    || host.includes("--staging")
    || host.includes("-staging")
  ) {
    return "staging";
  }
  return "production";
}

const firebaseEnvironment = resolveFirebaseEnvironment();
const firebaseConfig = firebaseEnvironment === "staging"
  ? stagingFirebaseConfig
  : productionFirebaseConfig;

if (!firebaseConfig) {
  throw new Error("Staging Firebase config is not set. Create the staging Firebase project, then set window.__nestplanStagingFirebaseConfig in index.html before using ?env=staging.");
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export {
  Timestamp,
  app,
  auth,
  collection,
  createUserWithEmailAndPassword,
  db,
  deleteDoc,
  doc,
  firebaseEnvironment,
  getDoc,
  getDocs,
  onAuthStateChanged,
  onSnapshot,
  reload,
  query,
  sendEmailVerification,
  sendPasswordResetEmail,
  serverTimestamp,
  setDoc,
  signInWithEmailAndPassword,
  signOut,
  updateDoc,
  updateProfile,
  where,
  writeBatch
};
