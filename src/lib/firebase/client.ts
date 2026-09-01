/**
 * Firebase client bootstrap (browser only).
 *
 * Reads the web-app config from NEXT_PUBLIC_FIREBASE_* env vars. When no
 * config is present the whole Firebase layer reports "not configured" and the
 * app falls back to its built-in JWT auth + local store.
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId: string;
}

export function getFirebaseConfig(): FirebaseConfig | null {
  const apiKey = env("NEXT_PUBLIC_FIREBASE_API_KEY");
  const projectId = env("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  if (!apiKey || !projectId) return null;
  return {
    apiKey,
    authDomain: env("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    projectId,
    storageBucket: env("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: env("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
    appId: env("NEXT_PUBLIC_FIREBASE_APP_ID"),
    measurementId: env("NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID"),
  };
}

export function isFirebaseConfigured(): boolean {
  return getFirebaseConfig() !== null;
}

/** Lazily initialise the Firebase app (singleton, browser only). */
export function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === "undefined") return null;
  const config = getFirebaseConfig();
  if (!config) return null;
  if (getApps().length > 0) return getApp();
  return initializeApp({
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    storageBucket: config.storageBucket,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId,
    measurementId: config.measurementId,
  });
}