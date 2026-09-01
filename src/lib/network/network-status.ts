/**
 * Client network awareness.
 *
 * `navigator.onLine` alone is unreliable (it flips late and says nothing
 * about quality), so quality is derived from the Network Information API
 * (effectiveType / downlink / saveData) with onLine as a floor. Components
 * subscribe via {@link subscribeNetwork} to react to offline/slow transitions.
 *
 * Pure client module — never import from server components.
 */

export type NetworkQuality = "offline" | "slow" | "normal" | "fast";

export type NetworkListener = (quality: NetworkQuality) => void;

type ConnectionInfo = {
  effectiveType?: string;
  downlink?: number;
  saveData?: boolean;
};

function connectionInfo(): ConnectionInfo | null {
  if (typeof navigator === "undefined") return null;
  const conn =
    (navigator as Navigator & { connection?: ConnectionInfo }).connection ?? null;
  return conn ?? null;
}

export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

export function getDownlinkMbps(): number | null {
  const info = connectionInfo();
  if (!info || typeof info.downlink !== "number") return null;
  return info.downlink;
}

/** Classify the current connection into a coarse quality bucket. */
export function getNetworkQuality(): NetworkQuality {
  if (!isOnline()) return "offline";

  const info = connectionInfo();
  if (!info) return "normal";

  const type = (info.effectiveType ?? "").toLowerCase();
  if (info.saveData) return "slow";
  if (type === "slow-2g" || type === "2g") return "slow";
  if (type === "3g" || (typeof info.downlink === "number" && info.downlink < 1.5)) return "slow";
  if (type === "4g" && typeof info.downlink === "number" && info.downlink >= 3) return "fast";
  return "normal";
}

const listeners = new Set<NetworkListener>();

function notify() {
  const quality = getNetworkQuality();
  for (const listener of listeners) {
    try {
      listener(quality);
    } catch {
      /* ignore listener errors */
    }
  }
}

let bound = false;

function ensureBound() {
  if (bound || typeof window === "undefined") return;
  bound = true;
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  const navigatorWithConn = navigator as Navigator & {
    connection?: EventTarget;
  };
  navigatorWithConn.connection?.addEventListener?.("change", notify);
}

/** Subscribe to network-quality changes. Returns an unsubscribe function. */
export function subscribeNetwork(listener: NetworkListener): () => void {
  listeners.add(listener);
  ensureBound();
  listener(getNetworkQuality());
  return () => {
    listeners.delete(listener);
  };
}

export const NETWORK_TIMEOUTS = {
  /** Short, predictable lookups (barcode / name search). */
  lookup: 8000,
  /** Photo OCR + upload can take longer. */
  upload: 20000,
  /** Full product analysis usually runs warm. */
  analysis: 30000,
};