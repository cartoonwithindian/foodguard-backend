/**
 * Firestore data access (browser only). Data is read/written directly from the
 * client and protected by firestore.rules (each user only accesses their own
 * documents). When Firebase is not configured these helpers no-op.
 *
 * Collections:
 *   users/{uid}                 - profile { name, language, role, createdAt }
 *   users/{uid}/preferences     - the 8 preference fields
 *   users/{uid}/history/{id}    - one scan/analysis history entry
 */

import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  limit,
  type Firestore,
} from "firebase/firestore";
import { getFirebaseApp } from "./client";

export interface FirebaseProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  language: string;
  createdAt: number;
  memberSince: string;
}

export interface FirebasePreferences {
  vegetarian: boolean;
  vegan: boolean;
  allergies: string[];
  dietaryRestrictions: string[];
  avoidIngredients: string[];
  preferredIngredients: string[];
  healthGoals: string[];
  sensitivityPreferences: string[];
}

export interface FirebaseHistoryItem {
  id: string;
  productId: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  barcode: string | null;
  imageUrl: string | null;
  scannedAt: number;
  score: number | null;
  source: string | null;
  assessment: unknown;
  analysis: unknown;
}

function db(): Firestore | null {
  if (typeof window === "undefined") return null;
  const app = getFirebaseApp();
  return app ? getFirestore(app) : null;
}

const EMPTY_PREFS: FirebasePreferences = {
  vegetarian: false,
  vegan: false,
  allergies: [],
  dietaryRestrictions: [],
  avoidIngredients: [],
  preferredIngredients: [],
  healthGoals: [],
  sensitivityPreferences: [],
};

// ── Profile ──────────────────────────────────────────────────────────────

export async function firebaseGetProfile(uid: string): Promise<FirebaseProfile | null> {
  const d = db();
  if (!d) return null;
  const snap = await getDoc(doc(d, "users", uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    id: uid,
    email: data.email ?? "",
    name: data.name ?? "User",
    role: data.role ?? "USER",
    language: data.language ?? "EN",
    createdAt: data.createdAt ?? Date.now(),
    memberSince: data.memberSince ?? "",
    ...(data as Partial<FirebaseProfile>),
  };
}

export async function firebaseSaveProfile(
  uid: string,
  profile: Partial<Omit<FirebaseProfile, "id" | "email">> & { email?: string },
): Promise<void> {
  const d = db();
  if (!d) return;
  const payload = { ...profile, updatedAt: Date.now() };
  await setDoc(doc(d, "users", uid), payload, { merge: true });
}

// ── Preferences ──────────────────────────────────────────────────────────

export async function firebaseGetPreferences(uid: string): Promise<FirebasePreferences> {
  const d = db();
  if (!d) return EMPTY_PREFS;
  const snap = await getDoc(doc(d, "users", uid, "preferences", "me"));
  if (!snap.exists()) return EMPTY_PREFS;
  return { ...EMPTY_PREFS, ...(snap.data() as Partial<FirebasePreferences>) };
}

export async function firebaseSavePreferences(
  uid: string,
  prefs: FirebasePreferences,
): Promise<void> {
  const d = db();
  if (!d) return;
  await setDoc(doc(d, "users", uid, "preferences", "me"), prefs, { merge: true });
}

// ── History ──────────────────────────────────────────────────────────────

export async function firebaseAddHistory(
  uid: string,
  entry: Omit<FirebaseHistoryItem, "id" | "scannedAt"> & { scannedAt?: number },
): Promise<FirebaseHistoryItem | null> {
  const d = db();
  if (!d) return null;
  const ref = await addDoc(collection(d, "users", uid, "history"), {
    ...entry,
    scannedAt: entry.scannedAt ?? Date.now(),
    createdAt: Date.now(),
  });
  return { ...entry, id: ref.id, scannedAt: entry.scannedAt ?? Date.now() };
}

export async function firebaseListHistory(uid: string, max = 100): Promise<FirebaseHistoryItem[]> {
  const d = db();
  if (!d) return [];
  const q = query(
    collection(d, "users", uid, "history"),
    orderBy("scannedAt", "desc"),
    limit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map((ds) => {
    const data = ds.data() as Partial<FirebaseHistoryItem>;
    return {
      id: ds.id,
      productId: data.productId ?? null,
      name: data.name ?? "Scanned product",
      brand: data.brand ?? null,
      category: data.category ?? null,
      barcode: data.barcode ?? null,
      imageUrl: data.imageUrl ?? null,
      scannedAt: data.scannedAt ?? 0,
      score: data.score ?? null,
      source: data.source ?? null,
      assessment: data.assessment ?? null,
      analysis: data.analysis ?? null,
    };
  });
}

export async function firebaseDeleteHistory(uid: string, id: string): Promise<void> {
  const d = db();
  if (!d) return;
  await deleteDoc(doc(d, "users", uid, "history", id));
}