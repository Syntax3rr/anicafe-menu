import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_API_KEY,
  authDomain: import.meta.env.VITE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_APP_ID,
  measurementId: import.meta.env.VITE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
// Default persistence keeps each device signed in across reloads
export const auth = getAuth(app);

/**
 * Feature flag for sign-in. Off by default so the app keeps working against a database
 * whose rules haven't been updated yet. Turn it on together with deploying firestore.rules:
 * with the flag off, those rules would block every request.
 */
export const AUTH_ENABLED = import.meta.env.VITE_AUTH_ENABLED === "true";
