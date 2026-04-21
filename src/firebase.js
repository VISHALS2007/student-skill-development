// ==============================
// Firebase Imports
// ==============================
import { initializeApp } from "firebase/app";
import { 
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import { getAnalytics, isSupported } from "firebase/analytics";


// ==============================
// Firebase Config
// ==============================
const firebaseConfig = {
  apiKey: "AIzaSyA8AHaZktJ4Hg-KZ7Ok3qBdRUaEiJe5E1k",
  authDomain: "student-skill-development.firebaseapp.com",
  projectId: "student-skill-development",
  storageBucket: "student-skill-development.firebasestorage.app",
  messagingSenderId: "439569692398",
  appId: "1:439569692398:web:3c979332ec87a1b4ad65ff",
  measurementId: "G-0BH1824YL6"
};


// ==============================
// Initialize Firebase App
// ==============================
const app = initializeApp(firebaseConfig);


// ==============================
// Auth Setup
// ==============================
export const auth = getAuth(app);

// Persist login session (professional standard)
setPersistence(auth, browserLocalPersistence);


// ==============================
// Google Provider (FIXED)
// ==============================
export const provider = new GoogleAuthProvider();

// Optional account-picker prompt (off by default for faster repeat Google login).
if (String(import.meta.env.VITE_GOOGLE_FORCE_SELECT_ACCOUNT || "false").toLowerCase() === "true") {
  provider.setCustomParameters({
    prompt: "select_account"
  });
}


// ==============================
// Firebase Services
// ==============================
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);


// ==============================
// Analytics (Safe Initialization)
// ==============================
let analytics = null;

isSupported().then((supported) => {
  if (supported) {
    analytics = getAnalytics(app);
  }
});

export { analytics };


// ==============================
// Default Export
// ==============================
export default app;
