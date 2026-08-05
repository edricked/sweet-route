import { Point } from "./domain";

export type RoadMask = { width: number; height: number; walkable: Uint8Array; clearance: Uint8Array };
export type RoadGeometryValidation = { coverage: number; offRoadSegments: Array<{ pathIndex: number; segmentIndex: number }>; sampledPoints: number };
const MAP_WIDTH = 2100, MAP_HEIGHT = 1600;
// Dark waterfront/encroachment artwork can resemble asphalt. These normalized
// regions are known non-roads and must never be included in delivery paths.
const ROAD_EXCLUSIONS: Point[][] = [
  // Waterfront encroachment/greenbelt below the Phase 1 blocks. The dark
  // printed fill is not a drivable road, even though it matches road colors.
  // Follow its slanted outline so nearby real roads remain connected.
  [
    {x:.345,y:.755}, {x:.455,y:.755}, {x:.505,y:.825},
    {x:.475,y:.845}, {x:.405,y:.805}, {x:.345,y:.795},
  ],
];

function insidePolygon(point: Point, polygon: Point[]) {
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
}

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

function roadClearance(mask:Uint8Array,width:number,height:number){
  const out=new Uint8Array(mask.length);for(let i=0;i<mask.length;i++)out[i]=mask[i]?255:0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x;if(!out[i])continue;out[i]=Math.min(out[i],x?out[i-1]+1:1,y?out[i-width]+1:1);}
  for(let y=height-1;y>=0;y--)for(let x=width-1;x>=0;x--){const i=y*width+x;if(!out[i])continue;out[i]=Math.min(out[i],x+1<width?out[i+1]+1:1,y+1<height?out[i+width]+1:1);}
  return out;
}

export function createRoadMask(image: HTMLImageElement): RoadMask {
  const width=600, height=Math.round(width*image.naturalHeight/image.naturalWidth);
  const canvas=document.createElement("canvas"); canvas.width=width; canvas.height=height;
  const context=canvas.getContext("2d",{willReadFrequently:true})!; context.drawImage(image,0,0,width,height);
  const pixels=context.getImageData(0,0,width,height).data, raw=new Uint8Array(width*height);
  for(let i=0;i<raw.length;i++){const o=i*4,r=pixels[o],g=pixels[o+1],b=pixels[o+2]; if(r<75&&g<75&&b<75&&Math.max(r,g,b)-Math.min(r,g,b)<18) raw[i]=1;}
  // Remove isolated printed details; clearance-weighted routing below then
  // prefers wide street interiors over thin building and lot outlines.
  const broadDarkAreas=open(close(raw,width,height,2),width,height,2);
  const connectedRoads=largestComponent(broadDarkAreas,width,height);
  const walkable=close(connectedRoads,width,height,2);
  for(const exclusion of ROAD_EXCLUSIONS)
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)
      if(insidePolygon({x:x/(width-1),y:y/(height-1)},exclusion))walkable[y*width+x]=0;
  return {width,height,walkable,clearance:roadClearance(walkable,width,height)};
}

export function roadPath(from: Point,to: Point,mask: RoadMask): Point[] {
  const pixel=(p:Point)=>({x:Math.round(p.x*(mask.width-1)),y:Math.round(p.y*(mask.height-1))});
  const nearest=(seed:{x:number;y:number})=>{let best=-1,bestScore=Infinity;for(let dy=-45;dy<=45;dy++)for(let dx=-45;dx<=45;dx++){const x=seed.x+dx,y=seed.y+dy;if(x<0||x>=mask.width||y<0||y>=mask.height)continue;const index=y*mask.width+x;if(!mask.walkable[index])continue;const score=Math.hypot(dx,dy)+Math.max(0,8-mask.clearance[index])*5;if(score<bestScore){best=index;bestScore=score;}}return best;};
  const start=nearest(pixel(from)),end=nearest(pixel(to)); if(start<0||end<0)return [];
  const previous=new Int32Array(mask.walkable.length);previous.fill(-1);previous[start]=start;
  const costs=new Float64Array(mask.walkable.length);costs.fill(Infinity);costs[start]=0;
  const heap:Array<{node:number;priority:number;cost:number}>=[];
  const push=(item:{node:number;priority:number;cost:number})=>{heap.push(item);let i=heap.length-1;while(i>0){const parent=(i-1)>>1;if(heap[parent].priority<=item.priority)break;heap[i]=heap[parent];i=parent;}heap[i]=item;};
  const pop=()=>{const root=heap[0],last=heap.pop()!;if(heap.length){let i=0;while(true){let child=i*2+1;if(child>=heap.length)break;if(child+1<heap.length&&heap[child+1].priority<heap[child].priority)child++;if(heap[child].priority>=last.priority)break;heap[i]=heap[child];i=child;}heap[i]=last;}return root;};
  const endX=end%mask.width,endY=Math.floor(end/mask.width);push({node:start,priority:0,cost:0});
  while(heap.length){const item=pop(),current=item.node;if(item.cost!==costs[current])continue;if(current===end)break;const x=current%mask.width,y=Math.floor(current/mask.width);for(const next of[x>0?current-1:-1,x+1<mask.width?current+1:-1,y>0?current-mask.width:-1,y+1<mask.height?current+mask.width:-1])if(next>=0&&mask.walkable[next]){const edgePenalty=Math.max(0,7-mask.clearance[next])*8,nextCost=costs[current]+1+edgePenalty;if(nextCost<costs[next]){costs[next]=nextCost;previous[next]=current;const nx=next%mask.width,ny=Math.floor(next/mask.width);push({node:next,priority:nextCost+Math.abs(nx-endX)+Math.abs(ny-endY),cost:nextCost});}}}
  if(previous[end]<0)return[];const raw:Point[]=[];for(let node=end;node!==start;node=previous[node])raw.push({x:(node%mask.width)/(mask.width-1),y:Math.floor(node/mask.width)/(mask.height-1)});raw.push({x:(start%mask.width)/(mask.width-1),y:Math.floor(start/mask.width)/(mask.height-1)});raw.reverse();return raw.filter((_,i)=>i===0||i===raw.length-1||i%5===0);
}

export function routeDistance(from: Point,to: Point,mask: RoadMask|null) {
  if(mask){const path=roadPath(from,to,mask);if(path.length>1)return path.slice(1).reduce((sum,p,i)=>sum+distance(path[i],p),0);}return distance(from,to);
}

export function validateRoadGeometry(paths: Point[][], mask: RoadMask | null): RoadGeometryValidation {
  if (!mask) return { coverage: 0, offRoadSegments: [], sampledPoints: 0 };
  let onRoad = 0, sampledPoints = 0;
  const offRoadSegments: Array<{ pathIndex: number; segmentIndex: number }> = [];
  const isRoad = (point: Point) => {
    const centerX = Math.round(point.x * (mask.width - 1)), centerY = Math.round(point.y * (mask.height - 1));
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const x = centerX + dx, y = centerY + dy;
      if (x >= 0 && x < mask.width && y >= 0 && y < mask.height && mask.walkable[y * mask.width + x]) return true;
    }
    return false;
  };
  paths.forEach((path, pathIndex) => {
    for (let index = 1; index < path.length; index++) {
      const from = path[index - 1], to = path[index];
      const length = Math.hypot((to.x - from.x) * mask.width, (to.y - from.y) * mask.height);
      const samples = Math.max(2, Math.ceil(length / 2));
      let segmentOnRoad = 0;
      for (let sample = 0; sample <= samples; sample++) {
        const ratio = sample / samples;
        const point = { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
        sampledPoints += 1;
        if (isRoad(point)) { onRoad += 1; segmentOnRoad += 1; }
      }
      if (segmentOnRoad / (samples + 1) < .8) offRoadSegments.push({ pathIndex, segmentIndex: index - 1 });
    }
  });
  return { coverage: sampledPoints ? onRoad / sampledPoints : 0, offRoadSegments, sampledPoints };
}
