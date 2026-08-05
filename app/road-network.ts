import { Point } from "./domain";

export type RoadPath = { id: string; points: Point[] };
export type RoadNetwork = { version: 1; paths: RoadPath[]; active?: boolean };
export type RoadNetworkValidation = {
  valid: boolean;
  usablePaths: number;
  incompletePaths: number;
  components: number;
  unreachablePoints: number;
};

export const EMPTY_ROAD_NETWORK: RoadNetwork = { version: 1, paths: [], active: false };

const MAP_WIDTH = 2100;
const MAP_HEIGHT = 1600;

function distance(a: Point, b: Point) {
  return Math.hypot((a.x-b.x)*MAP_WIDTH,(a.y-b.y)*MAP_HEIGHT);
}

function pointKey(point: Point) { return `${point.x.toFixed(6)}:${point.y.toFixed(6)}`; }

function buildGraph(network: RoadNetwork) {
  const nodes: Point[]=[];
  const nodeByKey=new Map<string,number>();
  const edges=new Map<number,Array<{to:number;cost:number}>>();
  const nodeIndex=(point:Point)=>{
    const key=pointKey(point),existing=nodeByKey.get(key);
    if(existing!==undefined)return existing;
    const index=nodes.length;nodes.push(point);nodeByKey.set(key,index);edges.set(index,[]);return index;
  };
  for(const path of network.paths){
    for(let index=1;index<path.points.length;index++){
      const from=nodeIndex(path.points[index-1]),to=nodeIndex(path.points[index]);
      const cost=distance(nodes[from],nodes[to]);
      edges.get(from)!.push({to,cost});edges.get(to)!.push({to:from,cost});
    }
  }
  return {nodes,edges,nodeByKey};
}

export function hasRoadNetwork(network: RoadNetwork) {
  return network.paths.some((path)=>path.points.length>1);
}

export function validateRoadNetwork(network: RoadNetwork, anchor: Point | null, destinations: Point[]): RoadNetworkValidation {
  const usablePaths=network.paths.filter((path)=>path.points.length>1).length;
  const incompletePaths=network.paths.length-usablePaths;
  const {nodes,edges}=buildGraph(network);
  const visited=new Uint8Array(nodes.length);
  let components=0;
  for(let start=0;start<nodes.length;start++){
    if(visited[start])continue;
    components+=1;
    const pending=[start];visited[start]=1;
    while(pending.length){
      const current=pending.pop()!;
      for(const edge of edges.get(current)??[])if(!visited[edge.to]){visited[edge.to]=1;pending.push(edge.to);}
    }
  }
  const unreachablePoints=anchor?destinations.filter((point)=>roadNetworkPath(anchor,point,network).length<2).length:destinations.length;
  return {
    valid:Boolean(anchor)&&usablePaths>0&&incompletePaths===0&&components===1&&unreachablePoints===0,
    usablePaths,incompletePaths,components,unreachablePoints,
  };
}

export function nearestRoadPoint(point: Point, network: RoadNetwork, maxDistance=18) {
  const points=network.paths.flatMap((path)=>path.points);
  if(!points.length)return point;
  let nearest=points[0],best=distance(point,nearest);
  for(const candidate of points.slice(1)){const next=distance(point,candidate);if(next<best){nearest=candidate;best=next;}}
  return best<=maxDistance?nearest:point;
}

export function roadNetworkPath(from: Point, to: Point, network: RoadNetwork): Point[] {
  const {nodes,edges,nodeByKey}=buildGraph(network);if(!nodes.length)return[];
  type Projection={point:Point;fromNode:number;toNode:number;fromCost:number;toCost:number;pathIndex:number;segmentIndex:number;ratio:number};
  const nearestSegment=(point:Point):Projection|null=>{
    let best:Projection|null=null,bestDistance=Infinity;
    network.paths.forEach((path,pathIndex)=>path.points.slice(1).forEach((segmentEnd,offset)=>{
      const segmentStart=path.points[offset];
      const ax=segmentStart.x*MAP_WIDTH,ay=segmentStart.y*MAP_HEIGHT,bx=segmentEnd.x*MAP_WIDTH,by=segmentEnd.y*MAP_HEIGHT;
      const px=point.x*MAP_WIDTH,py=point.y*MAP_HEIGHT,dx=bx-ax,dy=by-ay,lengthSquared=dx*dx+dy*dy;
      const ratio=lengthSquared?Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/lengthSquared)):0;
      const projected={x:(ax+ratio*dx)/MAP_WIDTH,y:(ay+ratio*dy)/MAP_HEIGHT};
      const nextDistance=distance(point,projected);
      if(nextDistance<bestDistance){
        const fromNode=nodeByKey.get(pointKey(segmentStart)),toNode=nodeByKey.get(pointKey(segmentEnd));
        if(fromNode===undefined||toNode===undefined)return;
        bestDistance=nextDistance;
        best={point:projected,fromNode,toNode,fromCost:distance(segmentStart,projected),toCost:distance(projected,segmentEnd),pathIndex,segmentIndex:offset,ratio};
      }
    }));
    return best;
  };
  const startProjection=nearestSegment(from),endProjection=nearestSegment(to);if(!startProjection||!endProjection)return[];
  const addProjection=(projection:Projection)=>{
    const index=nodes.length;nodes.push(projection.point);edges.set(index,[{to:projection.fromNode,cost:projection.fromCost},{to:projection.toNode,cost:projection.toCost}]);
    edges.get(projection.fromNode)!.push({to:index,cost:projection.fromCost});edges.get(projection.toNode)!.push({to:index,cost:projection.toCost});
    return index;
  };
  const start=addProjection(startProjection),end=addProjection(endProjection);
  if(startProjection.pathIndex===endProjection.pathIndex&&startProjection.segmentIndex===endProjection.segmentIndex){
    const direct=Math.abs(startProjection.ratio-endProjection.ratio)*(startProjection.fromCost+startProjection.toCost);
    edges.get(start)!.push({to:end,cost:direct});edges.get(end)!.push({to:start,cost:direct});
  }
  const costs=new Float64Array(nodes.length);costs.fill(Infinity);costs[start]=0;
  const previous=new Int32Array(nodes.length);previous.fill(-1);
  const visited=new Uint8Array(nodes.length);
  for(let count=0;count<nodes.length;count++){
    let current=-1,best=Infinity;
    for(let i=0;i<nodes.length;i++)if(!visited[i]&&costs[i]<best){best=costs[i];current=i;}
    if(current<0||current===end)break;visited[current]=1;
    for(const edge of edges.get(current)??[]){const next=costs[current]+edge.cost;if(next<costs[edge.to]){costs[edge.to]=next;previous[edge.to]=current;}}
  }
  if(start!==end&&previous[end]<0)return[];
  const route:Point[]=[];for(let node=end;node>=0;node=previous[node]){route.push(nodes[node]);if(node===start)break;}
  route.reverse();return [from,...route,to];
}

export function roadNetworkDistance(from: Point,to: Point,network:RoadNetwork) {
  const path=roadNetworkPath(from,to,network);if(path.length<2)return Infinity;
  return path.slice(1).reduce((total,point,index)=>total+distance(path[index],point),0);
}
