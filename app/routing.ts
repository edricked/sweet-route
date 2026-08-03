import { Point } from "./domain";

export type RoadMask = { width: number; height: number; walkable: Uint8Array };
const MAP_WIDTH = 2100, MAP_HEIGHT = 1600;
// Dark waterfront/encroachment artwork can resemble asphalt. These normalized
// regions are known non-roads and must never be included in delivery paths.
const ROAD_EXCLUSIONS = [
  // Waterfront encroachment/greenbelt below the Phase 1 blocks. The dark
  // printed fill is not a drivable road, even though it matches road colors.
  { left:.325, top:.755, right:.575, bottom:.89 },
];

function distance(a: Point, b: Point) { return Math.hypot((a.x-b.x)*MAP_WIDTH, (a.y-b.y)*MAP_HEIGHT); }
function dilate(mask: Uint8Array, width: number, height: number, radius: number) {
  const horizontal = new Uint8Array(width*height), out = new Uint8Array(width*height);
  for (let y=0;y<height;y++) for (let x=0;x<width;x++) for (let d=-radius;d<=radius;d++) { const xx=x+d; if(xx>=0&&xx<width&&mask[y*width+xx]) { horizontal[y*width+x]=1; break; } }
  for (let x=0;x<width;x++) for (let y=0;y<height;y++) for (let d=-radius;d<=radius;d++) { const yy=y+d; if(yy>=0&&yy<height&&horizontal[yy*width+x]) { out[y*width+x]=1; break; } }
  return out;
}
function invert(mask: Uint8Array) { const out=new Uint8Array(mask.length); for(let i=0;i<mask.length;i++) out[i]=mask[i]?0:1; return out; }
function close(mask: Uint8Array,w:number,h:number,r:number) { return invert(dilate(invert(dilate(mask,w,h,r)),w,h,r)); }
function open(mask: Uint8Array,w:number,h:number,r:number) { return dilate(invert(dilate(invert(mask),w,h,r)),w,h,r); }
function largestComponent(mask: Uint8Array,width:number,height:number) {
  const visited=new Uint8Array(mask.length),queue=new Int32Array(mask.length);let best:number[]=[];
  for(let seed=0;seed<mask.length;seed++){
    if(!mask[seed]||visited[seed])continue;
    let head=0,tail=0;const component:number[]=[];queue[tail++]=seed;visited[seed]=1;
    while(head<tail){const current=queue[head++],x=current%width,y=Math.floor(current/width);component.push(current);
      for(const next of[x>0?current-1:-1,x+1<width?current+1:-1,y>0?current-width:-1,y+1<height?current+width:-1])if(next>=0&&mask[next]&&!visited[next]){visited[next]=1;queue[tail++]=next;}
    }
    if(component.length>best.length)best=component;
  }
  const out=new Uint8Array(mask.length);for(const index of best)out[index]=1;return out;
}

export function createRoadMask(image: HTMLImageElement): RoadMask {
  const width=600, height=Math.round(width*image.naturalHeight/image.naturalWidth);
  const canvas=document.createElement("canvas"); canvas.width=width; canvas.height=height;
  const context=canvas.getContext("2d",{willReadFrequently:true})!; context.drawImage(image,0,0,width,height);
  const pixels=context.getImageData(0,0,width,height).data, raw=new Uint8Array(width*height);
  for(let i=0;i<raw.length;i++){const o=i*4,r=pixels[o],g=pixels[o+1],b=pixels[o+2]; if(r<75&&g<75&&b<75&&Math.max(r,g,b)-Math.min(r,g,b)<18) raw[i]=1;}
  const broadDarkAreas=open(close(raw,width,height,2),width,height,2);
  const connectedRoads=largestComponent(broadDarkAreas,width,height);
  const walkable=close(connectedRoads,width,height,2);
  for(const exclusion of ROAD_EXCLUSIONS){
    const left=Math.floor(exclusion.left*width),right=Math.ceil(exclusion.right*width);
    const top=Math.floor(exclusion.top*height),bottom=Math.ceil(exclusion.bottom*height);
    for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)walkable[y*width+x]=0;
  }
  return {width,height,walkable};
}

export function roadPath(from: Point,to: Point,mask: RoadMask): Point[] {
  const pixel=(p:Point)=>({x:Math.round(p.x*(mask.width-1)),y:Math.round(p.y*(mask.height-1))});
  const nearest=(seed:{x:number;y:number})=>{for(let r=0;r<100;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){if(Math.abs(dx)!==r&&Math.abs(dy)!==r)continue;const x=seed.x+dx,y=seed.y+dy;if(x>=0&&x<mask.width&&y>=0&&y<mask.height&&mask.walkable[y*mask.width+x])return y*mask.width+x;}return -1;};
  const start=nearest(pixel(from)),end=nearest(pixel(to)); if(start<0||end<0)return [];
  const previous=new Int32Array(mask.walkable.length);previous.fill(-1);previous[start]=start;
  const queue=new Int32Array(mask.walkable.length);let head=0,tail=0;queue[tail++]=start;
  while(head<tail&&previous[end]<0){const current=queue[head++],x=current%mask.width,y=Math.floor(current/mask.width);for(const next of[x>0?current-1:-1,x+1<mask.width?current+1:-1,y>0?current-mask.width:-1,y+1<mask.height?current+mask.width:-1])if(next>=0&&mask.walkable[next]&&previous[next]<0){previous[next]=current;queue[tail++]=next;}}
  if(previous[end]<0)return[];const raw:Point[]=[];for(let node=end;node!==start;node=previous[node])raw.push({x:(node%mask.width)/(mask.width-1),y:Math.floor(node/mask.width)/(mask.height-1)});raw.push({x:(start%mask.width)/(mask.width-1),y:Math.floor(start/mask.width)/(mask.height-1)});raw.reverse();return raw.filter((_,i)=>i===0||i===raw.length-1||i%5===0);
}

export function routeDistance(from: Point,to: Point,mask: RoadMask|null) {
  if(mask){const path=roadPath(from,to,mask);if(path.length>1)return path.slice(1).reduce((sum,p,i)=>sum+distance(path[i],p),0);}return distance(from,to);
}
