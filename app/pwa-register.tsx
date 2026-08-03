"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("./sw.js", { scope: "./" }).then((registration) => {
        registration.update().catch(() => undefined);
      }).catch(() => undefined);
    };

    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
