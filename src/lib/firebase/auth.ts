/**
 * Firebase Auth helpers (browser only). Backed by the modular SDK.
 * Providers expected to be enabled in the Firebase Console:
 *   - Email/Password
 *   - Anonymous (for the "Continue as Guest" flow)
 */

import {
  getAuth,
  onAuthStateChanged,
  type Auth,
  type User,
} from "firebase/auth";
import { getFirebaseApp } from "./client";

export type AuthStateListener = (user: User | null) => void;

function getBrowserAuth(): Auth | null {
  if (typeof window === "undefined") return null;
  const app = getFirebaseApp();
  return app ? getAuth(app) : null;
}

/** Subscribe to Firebase auth state changes. Returns an unsubscribe fn. */
export function onFirebaseAuthChange(listener: AuthStateListener): () => void {
  const auth = getBrowserAuth();
  if (!auth) return () => {};
  return onAuthStateChanged(auth, listener);
}

/** Firebase sign-in with email/password. */
export async function firebaseSignIn(email: string, password: string): Promise<User> {
  const { signInWithEmailAndPassword } = await import("firebase/auth");
  const auth = getBrowserAuth();
  if (!auth) throw new Error("Firebase is not configured");
  return signInWithEmailAndPassword(auth, email, password).then((c) => c.user);
}

/** Firebase account creation with email/password. */
export async function firebaseSignUp(email: string, password: string): Promise<User> {
  const { createUserWithEmailAndPassword } = await import("firebase/auth");
  const auth = getBrowserAuth();
  if (!auth) throw new Error("Firebase is not configured");
  return createUserWithEmailAndPassword(auth, email, password).then((c) => c.user);
}

/**
 * Sign in as a guest using Firebase Anonymous Auth. Each guest gets their own
 * stable uid, so their history/preferences persist to Firestore under their
 * own uid without any signup.
 */
export async function firebaseSignInAnonymously(): Promise<User> {
  const { signInAnonymously } = await import("firebase/auth");
  const auth = getBrowserAuth();
  if (!auth) throw new Error("Firebase is not configured");
  return signInAnonymously(auth).then((c) => c.user);
}

export async function firebaseSignOut(): Promise<void> {
  const auth = getBrowserAuth();
  if (!auth) return;
  const { signOut } = await import("firebase/auth");
  await signOut(auth);
}

/** Update the display name on the current Firebase user (profile save). */
export async function firebaseUpdateDisplayName(name: string): Promise<void> {
  const auth = getBrowserAuth();
  if (!auth?.currentUser) return;
  const { updateProfile } = await import("firebase/auth");
  await updateProfile(auth.currentUser, { displayName: name });
}