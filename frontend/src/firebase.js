// Person 4: connect to Firebase.
// The settings come from frontend/.env (see .env.example).
// If they're missing, `auth` is null and the site works without login.

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const auth = config.apiKey ? getAuth(initializeApp(config)) : null;
