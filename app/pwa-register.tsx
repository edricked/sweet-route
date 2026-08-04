"use client";

import { useEffect, useState } from "react";

export function PwaRegister() {
  const [waitingWorker,setWaitingWorker]=useState<ServiceWorker|null>(null);
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
        if(registration.waiting&&navigator.serviceWorker.controller)setWaitingWorker(registration.waiting);
        registration.addEventListener("updatefound",()=>{
          const worker=registration?.installing;if(!worker)return;
          worker.addEventListener("statechange",()=>{if(worker.state==="installed"&&navigator.serviceWorker.controller)setWaitingWorker(worker);});
        });
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

  if(!waitingWorker)return null;
  return <div className="pwa-update"><div><strong>Sweet Route updated</strong><small>Install the latest fixes without losing local data.</small></div><button onClick={()=>waitingWorker.postMessage({type:"SKIP_WAITING"})}>Update now</button><button className="pwa-update-later" aria-label="Dismiss update" onClick={()=>setWaitingWorker(null)}>×</button></div>;
}
