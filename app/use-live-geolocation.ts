"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { distanceMeters, GeoReading, readingFromPosition, smoothReadings } from "./geolocation";

type TrackingStatus="idle"|"requesting"|"tracking"|"error";

export function useLiveGeolocation(){
  const watchRef=useRef<number|null>(null),readingsRef=useRef<GeoReading[]>([]),stableReadingRef=useRef<GeoReading|null>(null),wakeLockRef=useRef<{release:()=>Promise<void>}|null>(null);
  const [status,setStatus]=useState<TrackingStatus>("idle"),[reading,setReading]=useState<GeoReading|null>(null),[error,setError]=useState("");
  const stop=useCallback(()=>{if(watchRef.current!==null&&navigator.geolocation)navigator.geolocation.clearWatch(watchRef.current);watchRef.current=null;readingsRef.current=[];stableReadingRef.current=null;void wakeLockRef.current?.release();wakeLockRef.current=null;setStatus("idle");},[]);
  const start=useCallback(async()=>{
    if(!navigator.geolocation){setError("Geolocation is unavailable on this device.");setStatus("error");return;}
    stop();setStatus("requesting");setError("");
    const wakeLock=(navigator as Navigator&{wakeLock?:{request:(type:"screen")=>Promise<{release:()=>Promise<void>}>}}).wakeLock;
    try{if(wakeLock)wakeLockRef.current=await wakeLock.request("screen");}catch{/* Tracking remains usable without a wake lock. */}
    watchRef.current=navigator.geolocation.watchPosition((position)=>{
      const next=readingFromPosition(position);if(next.accuracy>30){setError(`Weak GPS accuracy: ${Math.round(next.accuracy)} m`);return;}
      if(stableReadingRef.current&&next.accuracy>15){setError(`Low GPS confidence: ${Math.round(next.accuracy)} m · position held`);return;}
      readingsRef.current=[...readingsRef.current.slice(-4),next];
      const candidate=smoothReadings(readingsRef.current);if(!candidate)return;
      const previous=stableReadingRef.current;
      let stable=candidate;
      if(previous){
        const movement=distanceMeters(previous,candidate),stationary=(candidate.speed??0)<.8,deadZone=Math.max(4,Math.min(9,candidate.accuracy*.55));
        if(stationary&&movement<=deadZone)stable={...previous,accuracy:candidate.accuracy,timestamp:candidate.timestamp,heading:candidate.heading,speed:candidate.speed};
        else if(stationary){const blend=movement>20?.28:.16;stable={...candidate,latitude:previous.latitude+(candidate.latitude-previous.latitude)*blend,longitude:previous.longitude+(candidate.longitude-previous.longitude)*blend};}
      }
      stableReadingRef.current=stable;setReading(stable);setStatus("tracking");setError(next.accuracy>12?`GPS accuracy: ${Math.round(next.accuracy)} m`:"");
    },(failure)=>{setError(failure.message);setStatus("error");},{enableHighAccuracy:true,maximumAge:1500,timeout:15000});
  },[stop]);
  useEffect(()=>stop,[stop]);
  return {status,reading,error,start,stop};
}
