"use client";

import { useEffect, useState } from "react";
import { EMPTY_ROAD_NETWORK, RoadNetwork } from "./road-network";

const STORAGE_KEY="sweet-route-road-network-v1";

export function useRoadNetwork(){
  const [network,setNetwork]=useState<RoadNetwork>(()=>{
    if(typeof window==="undefined")return EMPTY_ROAD_NETWORK;
    try{
      const saved=localStorage.getItem(STORAGE_KEY);
      if(saved){const parsed=JSON.parse(saved) as RoadNetwork;if(parsed.version===1&&Array.isArray(parsed.paths))return parsed;}
    }catch{/* Preserve a corrupt payload for future manual recovery. */}
    return EMPTY_ROAD_NETWORK;
  });
  useEffect(()=>{localStorage.setItem(STORAGE_KEY,JSON.stringify(network));},[network]);
  return [network,setNetwork] as const;
}
