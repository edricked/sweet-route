"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    const preventPageZoom = (event: Event) => event.preventDefault();
    document.addEventListener("gesturestart", preventPageZoom, { passive: false });
    document.addEventListener("gesturechange", preventPageZoom, { passive: false });
    document.addEventListener("gestureend", preventPageZoom, { passive: false });
    return () => {
      document.removeEventListener("gesturestart", preventPageZoom);
      document.removeEventListener("gesturechange", preventPageZoom);
      document.removeEventListener("gestureend", preventPageZoom);
    };
  }, []);

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
