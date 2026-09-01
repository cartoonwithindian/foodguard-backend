"use client";

import { useEffect, useState } from "react";
import {
  getNetworkQuality,
  subscribeNetwork,
  isOnline,
  type NetworkQuality,
} from "./network-status";

/** Subscribe to live network quality for the current component. */
export function useNetworkQuality(): NetworkQuality {
  const [quality, setQuality] = useState<NetworkQuality>(() =>
    typeof window === "undefined" ? "normal" : getNetworkQuality(),
  );

  useEffect(() => {
    return subscribeNetwork((next) => setQuality(next));
  }, []);

  return quality;
}

export function useOnline(): boolean {
  const quality = useNetworkQuality();
  return quality !== "offline";
}

/** Snapshot-only online check (no subscriptions). */
export function useOnlineSnapshot(): boolean {
  const [online] = useState(() => (typeof window === "undefined" ? true : isOnline()));
  return online;
}