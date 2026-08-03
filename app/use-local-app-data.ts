"use client";

import { useEffect, useRef, useState } from "react";
import { Address, AppData, EMPTY_APP_DATA } from "./domain";

const STORAGE_KEY = "phirst-delivery-mvp-v1";
const INITIAL_ADDRESS_MIGRATION_KEY = "sweet-route-initial-addresses-v1";
const SEEDED_OWNER_CORRECTION_KEY = "sweet-route-seeded-owner-correction-v1";
const SEEDED_OWNER_ID = "address-daf414a7-aac7-4488-9800-26150f1d1b78";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function useLocalAppData() {
  const [data, setData] = useState<AppData>(EMPTY_APP_DATA);
  const skipFirstSave = useRef(true);

  useEffect(() => {
    let cancelled = false;
    const saved = localStorage.getItem(STORAGE_KEY);
    let restored: AppData = EMPTY_APP_DATA;
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Partial<AppData>;
        if (Array.isArray(parsed.addresses) && Array.isArray(parsed.orders)) {
          const parsedOrders = parsed.orders;
          const clearOrders = new URLSearchParams(window.location.search).get("clearOrders") === "1";
          const restoredOrders = clearOrders ? [] : parsedOrders;
          const restoredAddresses = parsed.addresses.map((address) => {
            if (address.customerName) return address;
            const latestOrder = parsedOrders.find((order) => order.addressId === address.id);
            return latestOrder ? { ...address, customerName: latestOrder.customerName, phone: latestOrder.phone } : address;
          });
          restored = {
            addresses: restoredAddresses,
            orders: restoredOrders,
            products: Array.isArray(parsed.products) ? parsed.products : [],
            routeStartAddressId: parsed.routeStartAddressId,
          };
          if (clearOrders) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(restored));
            window.history.replaceState({}, "", window.location.pathname);
          }
        }
      } catch {
        // Never delete a user's records because a future build cannot parse them.
        // Backup/restore can recover the untouched payload.
      }
    }
    async function hydrate() {
      if (!localStorage.getItem(INITIAL_ADDRESS_MIGRATION_KEY)) {
        try {
          const response = await fetch(`${BASE_PATH}/initial-addresses.json`);
          if (!response.ok) throw new Error("Initial address migration unavailable");
          const seed = await response.json() as { type?: string; addresses?: Address[] };
          if (seed.type !== "sweet-route-addresses" || !Array.isArray(seed.addresses)) throw new Error("Invalid initial address migration");
          const merged = new Map(seed.addresses.map((address) => [`${address.phase}:${address.block}:${address.lot}`, address]));
          restored.addresses.forEach((address) => merged.set(`${address.phase}:${address.block}:${address.lot}`, address));
          restored = { ...restored, addresses: [...merged.values()] };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(restored));
          localStorage.setItem(INITIAL_ADDRESS_MIGRATION_KEY, "1");
        } catch {
          // Retry on the next load; never mark an incomplete migration as finished.
        }
      }
      if (!localStorage.getItem(SEEDED_OWNER_CORRECTION_KEY)) {
        restored = {
          ...restored,
          addresses: restored.addresses.filter((address) => address.id !== SEEDED_OWNER_ID),
          routeStartAddressId: restored.routeStartAddressId === SEEDED_OWNER_ID ? undefined : restored.routeStartAddressId,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(restored));
        localStorage.setItem(SEEDED_OWNER_CORRECTION_KEY, "1");
      }
      if (!cancelled) setData(restored);
    }
    void hydrate();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (skipFirstSave.current) { skipFirstSave.current = false; return; }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  return [data, setData] as const;
}
