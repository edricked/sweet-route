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

    let registration: ServiceWorkerRegistration | undefined;
    let reloading = false;
    const hadController = Boolean(navigator.serviceWorker.controller);
    const register = async () => {
      try {
        registration = await navigator.serviceWorker.register("./sw.js", { scope: "./", updateViaCache: "none" });
        await registration.update();
      } catch {
        // The current app remains usable offline if an update check fails.
      }
    };
    const checkForUpdate = () => {
      if (document.visibilityState === "visible") registration?.update().catch(() => undefined);
    };
    const reloadOnNewWorker = () => {
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    };

    if (document.readyState === "complete") void register();
    else window.addEventListener("load", register, { once: true });
    document.addEventListener("visibilitychange", checkForUpdate);
    navigator.serviceWorker.addEventListener("controllerchange", reloadOnNewWorker);
    return () => {
      window.removeEventListener("load", register);
      document.removeEventListener("visibilitychange", checkForUpdate);
      navigator.serviceWorker.removeEventListener("controllerchange", reloadOnNewWorker);
    };
  }, []);

  return null;
}
