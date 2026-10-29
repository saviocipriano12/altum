import { initializeApp, getApps, getApp } from "firebase/app";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectStorageEmulator, getStorage } from "firebase/storage";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { resolveFirebaseEmulatorConfig } from "@/lib/firebase-emulator-config";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const qaEmulators = typeof window !== "undefined" && process.env.NEXT_PUBLIC_ALTUM_QA_EMULATORS === "1"
  ? resolveFirebaseEmulatorConfig({ enabled: true, projectId: String(app.options.projectId || ""),
    hostname: window.location.hostname, production: process.env.NODE_ENV === "production" }) : null;

const appCheckSiteKey = process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY || "";
if (typeof window !== "undefined" && appCheckSiteKey) {
  const appCheckWindow = window as typeof window & { __altumAppCheckInitialized?: boolean };
  if (!appCheckWindow.__altumAppCheckInitialized) {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
    appCheckWindow.__altumAppCheckInitialized = true;
  }
}

export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app); // EXPORTAÇÃO ESSENCIAL

if (typeof window !== "undefined" && qaEmulators) {
  const emulator = qaEmulators;
  const qaWindow = window as typeof window & { __altumQaEmulatorsConnected?: boolean };
  if (emulator && !qaWindow.__altumQaEmulatorsConnected) {
    // The SDK's fixed bottom banner covers the conversation composer on small
    // viewports. This branch is restricted to the local demo project above.
    connectAuthEmulator(auth, `http://${emulator.host}:${emulator.authPort}`, { disableWarnings: true });
    connectFirestoreEmulator(db, emulator.host, emulator.firestorePort);
    connectStorageEmulator(storage, emulator.host, emulator.storagePort);
    qaWindow.__altumQaEmulatorsConnected = true;
  }
}
