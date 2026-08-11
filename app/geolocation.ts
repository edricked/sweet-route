import { Point } from "./domain";
import { CalibrationAnchor, RoadNetwork } from "./road-network";

export type TrackingMode = "vehicle" | "walking";
export type GeoReading = {
  latitude: number;
  longitude: number;
  accuracy: number;
  heading: number | null;
  speed: number | null;
  timestamp: number;
};
export type SnappedRoadPosition = Point & { pathId: string; segmentIndex: number; distancePixels: number };

const MAP_WIDTH=2100,MAP_HEIGHT=1600,EARTH_METERS_PER_DEGREE=111_320;

export function readingFromPosition(position:GeolocationPosition):GeoReading {
  return {latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy,heading:position.coords.heading,speed:position.coords.speed,timestamp:position.timestamp};
}

export function distanceMeters(a:Pick<GeoReading,"latitude"|"longitude">,b:Pick<GeoReading,"latitude"|"longitude">) {
  const latitude=(a.latitude+b.latitude)/2*Math.PI/180;
  const east=(a.longitude-b.longitude)*EARTH_METERS_PER_DEGREE*Math.cos(latitude);
  const north=(a.latitude-b.latitude)*EARTH_METERS_PER_DEGREE;
  return Math.hypot(east,north);
}

export function smoothReadings(readings:GeoReading[]):GeoReading|null {
  if(!readings.length)return null;
  const recent=readings.slice(-5),weights=recent.map((reading)=>1/Math.max(1,reading.accuracy)**2),weight=weights.reduce((sum,value)=>sum+value,0);
  const average=(pick:(reading:GeoReading)=>number)=>recent.reduce((sum,reading,index)=>sum+pick(reading)*weights[index],0)/weight;
  const headings=recent.filter((reading)=>reading.heading!==null);
  return {
    latitude:average((reading)=>reading.latitude),longitude:average((reading)=>reading.longitude),accuracy:Math.min(...recent.map((reading)=>reading.accuracy)),
    heading:headings.length?headings.at(-1)!.heading:null,speed:recent.at(-1)!.speed,timestamp:recent.at(-1)!.timestamp,
  };
}

function solve3(matrix:number[][],values:number[]) {
  const augmented=matrix.map((row,index)=>[...row,values[index]]);
  for(let column=0;column<3;column++){
    let pivot=column;for(let row=column+1;row<3;row++)if(Math.abs(augmented[row][column])>Math.abs(augmented[pivot][column]))pivot=row;
    if(Math.abs(augmented[pivot][column])<1e-10)return null;
    [augmented[column],augmented[pivot]]=[augmented[pivot],augmented[column]];
    const divisor=augmented[column][column];for(let entry=column;entry<4;entry++)augmented[column][entry]/=divisor;
    for(let row=0;row<3;row++)if(row!==column){const factor=augmented[row][column];for(let entry=column;entry<4;entry++)augmented[row][entry]-=factor*augmented[column][entry];}
  }
  return augmented.map((row)=>row[3]);
}

function affineCoefficients(anchors:CalibrationAnchor[],target:Pick<GeoReading,"latitude"|"longitude">) {
  if(anchors.length<3)return null;
  const origin=anchors[0],latitude=origin.latitude*Math.PI/180;
  const source=anchors.map((anchor)=>({
    east:(anchor.longitude-origin.longitude)*EARTH_METERS_PER_DEGREE*Math.cos(latitude),
    north:(anchor.latitude-origin.latitude)*EARTH_METERS_PER_DEGREE,
    x:anchor.x,y:anchor.y,
    distance:distanceMeters(anchor,target),
  }));
  const normal=Array.from({length:3},()=>Array(3).fill(0)) as number[][],xValues=[0,0,0],yValues=[0,0,0];
  for(const anchor of source){
    const row=[anchor.east,anchor.north,1],weight=1/Math.max(12,anchor.distance)**2;
    for(let i=0;i<3;i++){xValues[i]+=weight*row[i]*anchor.x;yValues[i]+=weight*row[i]*anchor.y;for(let j=0;j<3;j++)normal[i][j]+=weight*row[i]*row[j];}
  }
  const x=solve3(normal,xValues),y=solve3(normal,yValues);if(!x||!y)return null;
  return {origin,latitude,x,y};
}

export function gpsToImage(reading:GeoReading,anchors:CalibrationAnchor[]):Point|null {
  const coefficients=affineCoefficients(anchors,reading);if(!coefficients)return null;
  const east=(reading.longitude-coefficients.origin.longitude)*EARTH_METERS_PER_DEGREE*Math.cos(coefficients.latitude);
  const north=(reading.latitude-coefficients.origin.latitude)*EARTH_METERS_PER_DEGREE;
  const project=(values:number[])=>values[0]*east+values[1]*north+values[2];
  return {x:project(coefficients.x),y:project(coefficients.y)};
}

export function imageToGps(point:Point,anchors:CalibrationAnchor[]):Pick<GeoReading,"latitude"|"longitude">|null {
  if(anchors.length<3)return null;
  const origin=anchors[0],latitude=origin.latitude*Math.PI/180;
  const normal=Array.from({length:3},()=>Array(3).fill(0)) as number[][],eastValues=[0,0,0],northValues=[0,0,0];
  for(const anchor of anchors){
    const pixelX=(anchor.x-point.x)*MAP_WIDTH,pixelY=(anchor.y-point.y)*MAP_HEIGHT;
    const row=[pixelX,pixelY,1],weight=1/Math.max(40,Math.hypot(pixelX,pixelY))**2;
    const east=(anchor.longitude-origin.longitude)*EARTH_METERS_PER_DEGREE*Math.cos(latitude);
    const north=(anchor.latitude-origin.latitude)*EARTH_METERS_PER_DEGREE;
    for(let i=0;i<3;i++){eastValues[i]+=weight*row[i]*east;northValues[i]+=weight*row[i]*north;for(let j=0;j<3;j++)normal[i][j]+=weight*row[i]*row[j];}
  }
  const east=solve3(normal,eastValues),north=solve3(normal,northValues);if(!east||!north)return null;
  return {latitude:origin.latitude+north[2]/EARTH_METERS_PER_DEGREE,longitude:origin.longitude+east[2]/(EARTH_METERS_PER_DEGREE*Math.cos(latitude))};
}

export function calibrationMetersPerPixel(anchors:CalibrationAnchor[]) {
  const ratios:number[]=[];
  for(let i=0;i<anchors.length;i++)for(let j=i+1;j<anchors.length;j++){
    const pixels=Math.hypot((anchors[i].x-anchors[j].x)*MAP_WIDTH,(anchors[i].y-anchors[j].y)*MAP_HEIGHT);
    if(pixels>20)ratios.push(distanceMeters(anchors[i],anchors[j])/pixels);
  }
  if(!ratios.length)return null;ratios.sort((a,b)=>a-b);return ratios[Math.floor(ratios.length/2)];
}

export function calibrationQuality(anchors:CalibrationAnchor[]) {
  const quadrants=new Set(anchors.map((anchor)=>`${anchor.x<.5?0:1}:${anchor.y<.5?0:1}`));
  const averageAccuracy=anchors.length?anchors.reduce((sum,anchor)=>sum+anchor.accuracy,0)/anchors.length:Infinity;
  return {count:anchors.length,quadrants:quadrants.size,averageAccuracy,ready:anchors.length>=3,recommended:anchors.length>=6&&quadrants.size>=3&&averageAccuracy<=10};
}

export type AnchorValidationResult={
  anchor:CalibrationAnchor;
  predicted:Point;
  correctedCoordinate:Pick<GeoReading,"latitude"|"longitude">;
  errorMeters:number;
  status:"good"|"review"|"poor";
};

export function validateCalibrationAnchors(anchors:CalibrationAnchor[]):AnchorValidationResult[] {
  if(anchors.length<4)return [];
  const metersPerPixel=calibrationMetersPerPixel(anchors);
  if(!metersPerPixel)return [];
  return anchors.flatMap((anchor,index)=>{
    const otherAnchors=anchors.filter((_,anchorIndex)=>anchorIndex!==index);
    const predicted=gpsToImage({latitude:anchor.latitude,longitude:anchor.longitude,accuracy:anchor.accuracy,heading:null,speed:null,timestamp:new Date(anchor.capturedAt).getTime()},otherAnchors);
    const correctedCoordinate=imageToGps(anchor,otherAnchors);
    if(!predicted||!correctedCoordinate)return [];
    const pixels=Math.hypot((predicted.x-anchor.x)*MAP_WIDTH,(predicted.y-anchor.y)*MAP_HEIGHT);
    const errorMeters=pixels*metersPerPixel;
    return [{anchor,predicted,correctedCoordinate,errorMeters,status:errorMeters<=6?"good":errorMeters<=12?"review":"poor"}];
  });
}

export function roadSegmentKey(from:Point,to:Point) {
  return [from,to].map((point)=>`${point.x.toFixed(6)}:${point.y.toFixed(6)}`).sort().join("|");
}

export function networkForMode(network:RoadNetwork,mode:TrackingMode):RoadNetwork {
  if(mode==="walking"||!network.approvedWalkways?.length)return network;
  const approved=new Set(network.approvedWalkways),paths=network.paths.flatMap((path)=>{
    const chunks:typeof network.paths=[];let points=[path.points[0]];
    for(let index=1;index<path.points.length;index++){
      if(approved.has(roadSegmentKey(path.points[index-1],path.points[index]))){if(points.length>1)chunks.push({id:`${path.id}:${index}:before`,points});points=[path.points[index]];}
      else points.push(path.points[index]);
    }
    if(points.length>1)chunks.push({id:`${path.id}:after`,points});return chunks;
  });
  return {...network,paths};
}

export function snapToRoad(point:Point,network:RoadNetwork,previous?:Pick<SnappedRoadPosition,"pathId"|"segmentIndex">|null):SnappedRoadPosition|null {
  let best:SnappedRoadPosition|null=null,bestScore=Infinity;
  for(const path of network.paths)for(let segmentIndex=0;segmentIndex<path.points.length-1;segmentIndex++){
    const from=path.points[segmentIndex],to=path.points[segmentIndex+1],dx=(to.x-from.x)*MAP_WIDTH,dy=(to.y-from.y)*MAP_HEIGHT;
    const px=(point.x-from.x)*MAP_WIDTH,py=(point.y-from.y)*MAP_HEIGHT,lengthSquared=dx*dx+dy*dy;
    const ratio=lengthSquared?Math.max(0,Math.min(1,(px*dx+py*dy)/lengthSquared)):0;
    const projected={x:from.x+(to.x-from.x)*ratio,y:from.y+(to.y-from.y)*ratio};
    const distancePixels=Math.hypot((point.x-projected.x)*MAP_WIDTH,(point.y-projected.y)*MAP_HEIGHT);
    const pathPenalty=previous&&previous.pathId!==path.id?18:0;
    const segmentPenalty=previous&&previous.pathId===path.id?Math.min(24,Math.abs(previous.segmentIndex-segmentIndex)*2.5):0;
    const score=distancePixels+pathPenalty+segmentPenalty;
    if(score<bestScore){bestScore=score;best={...projected,pathId:path.id,segmentIndex,distancePixels};}
  }
  return best&&best.distancePixels<=100?best:null;
}

export function captureAccuratePosition(durationMs=9000):Promise<GeoReading> {
  return new Promise((resolve,reject)=>{
    if(!navigator.geolocation){reject(new Error("Geolocation is unavailable on this device."));return;}
    const readings:GeoReading[]=[];let finished=false,watchId=0;
    const finish=(error?:Error)=>{if(finished)return;finished=true;navigator.geolocation.clearWatch(watchId);window.clearTimeout(timer);const acceptable=readings.filter((reading)=>reading.accuracy<=15);const reading=smoothReadings(acceptable);if(error||!reading)reject(error??new Error("GPS accuracy stayed above 15 metres. Move outdoors and retry."));else resolve(reading);};
    const timer=window.setTimeout(()=>finish(),durationMs);
    watchId=navigator.geolocation.watchPosition((position)=>{const reading=readingFromPosition(position);readings.push(reading);if(readings.filter((item)=>item.accuracy<=5).length>=5)finish();},(error)=>{
      const message=error.code===error.PERMISSION_DENIED
        ? "Location access is denied. Enable Precise Location for Safari Websites, then reopen Sweet Route."
        : error.code===error.POSITION_UNAVAILABLE
          ? "Your location is unavailable. Move outdoors and try again."
          : "GPS timed out. Move outdoors, keep the screen awake, and try again.";
      finish(new Error(message));
    },{enableHighAccuracy:true,maximumAge:0,timeout:15000});
  });
}
