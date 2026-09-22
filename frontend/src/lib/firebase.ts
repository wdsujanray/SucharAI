import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Configured automatically using AI Studio provisioned project settings
const firebaseConfig = {
  apiKey: "AIzaSyAGZhl4fyn8HlCDGYYLwPEFKVdhDBLdjes",
  authDomain: "sucharai.firebaseapp.com",
  projectId: "sucharai",
  storageBucket: "sucharai.firebasestorage.app",
  messagingSenderId: "1045183785941",
  firestoreDatabaseId: "ai-studio-aichatbot-a513d18a-1ec8-4e65-95fc-db26da165ff3",
  appId: "1:1045183785941:web:e923af48f9dc93b35a2b5c",
  measurementId: "G-7G67N4HRB3"

};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication
export const auth = getAuth(app);

// Initialize Cloud Firestore Database with Offline persistence features
export const firestore = getFirestore(app);

// Initialize Firebase Storage for online file storage
export const storage = getStorage(app);
