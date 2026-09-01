/**
 * Firebase Analytics helpers (browser only). Logs a page_view whenever the
 * active route changes. Degrades gracefully when analytics is unavailable
 * (ad-blockers, unsupported platforms) or Firebase is not configured.
 */

import { getAnalytics, logEvent, isSupported, type Analytics } from "firebase/analytics";
import { getFirebaseApp } from "./client";

let analytics: Analytics | null | undefined;

export async function firebaseLogPageView(path: string, title?: string): Promise<void> {
  if (typeof window === "undefined") return;
  const app = getFirebaseApp();
  if (!app) return;
  if (analytics === undefined) {
    analytics = (await isSupported().catch(() => false)) ? getAnalytics(app) : null;
  }
  if (!analytics) return;
  try {
    logEvent(analytics, "page_view", { page_path: path, page_title: title });
  } catch {
    /* analytics is best-effort */
  }
}