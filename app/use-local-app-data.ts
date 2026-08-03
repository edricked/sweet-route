"use client";

import { useEffect, useRef, useState } from "react";
import { AppData, EMPTY_APP_DATA } from "./domain";

const STORAGE_KEY = "phirst-delivery-mvp-v1";

export function useLocalAppData() {
  const [data, setData] = useState<AppData>(EMPTY_APP_DATA);
  const skipFirstSave = useRef(true);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
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
          const restored: AppData = {
            addresses: restoredAddresses,
            orders: restoredOrders,
            products: Array.isArray(parsed.products) ? parsed.products : [],
            routeStartAddressId: parsed.routeStartAddressId,
          };
          if (clearOrders) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(restored));
            window.history.replaceState({}, "", window.location.pathname);
          }
          // Hydration intentionally synchronizes React state with the browser repository.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setData(restored);
        }
      } catch {
        // Never delete a user's records because a future build cannot parse them.
        // Backup/restore can recover the untouched payload.
      }
    }
  }, []);

  useEffect(() => {
    if (skipFirstSave.current) { skipFirstSave.current = false; return; }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  return [data, setData] as const;
}
