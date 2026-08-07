"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Address, AppData, AppTab, DeliveryStatus, Order, OrderLine, Product, STATUS_LABEL as statusLabel, VALID_BLOCKS, addressLabel, makeId } from "./domain";
import { RoadMask, createRoadMask, roadPath, routeDistance as roadOrStraightDistance, validateRoadGeometry } from "./routing";
import { useLocalAppData } from "./use-local-app-data";
import { AddressDetails, OrderDetails } from "./order-details";
import { RoadNetwork, connectRoadPoint, hasRoadNetwork, nearestRoadPoint, roadNetworkDistance, roadNetworkPath, validateRoadNetwork } from "./road-network";
import { useRoadNetwork } from "./use-road-network";
import { SalesDashboard } from "./sales-dashboard";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const MAX_MAP_ZOOM = 10;

export default function Home() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapViewportRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const addressImportRef = useRef<HTMLInputElement>(null);
  const orderImportRef = useRef<HTMLInputElement>(null);
  const productImportRef = useRef<HTMLInputElement>(null);
  const fullImportRef = useRef<HTMLInputElement>(null);
  const roadImportRef = useRef<HTMLInputElement>(null);
  const roadUndoStackRef = useRef<RoadNetwork[]>([]);
  const [data, setData, isHydrated] = useLocalAppData();
  const [roadNetwork,setRoadNetwork]=useRoadNetwork();
  const [pendingPoint, setPendingPoint] = useState<{ x: number; y: number } | null>(null);
  const [entryMode, setEntryMode] = useState<"order" | "owner" | "address">("order");
  const [phase, setPhase] = useState<1 | 2>(1);
  const [block, setBlock] = useState(3);
  const [lot, setLot] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [items, setItems] = useState("");
  const [selectedLines,setSelectedLines]=useState<OrderLine[]>([]);
  const [status, setStatus] = useState<DeliveryStatus>("preparing");
  const [notes, setNotes] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [pendingRouteStartOrderId, setPendingRouteStartOrderId] = useState<string | null>(null);
  const [filter, setFilter] = useState<DeliveryStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState(1);
  const [minimumZoom, setMinimumZoom] = useState(.75);
  const [routeAddressIds, setRouteAddressIds] = useState<string[]>([]);
  const [routeVisible, setRouteVisible] = useState(true);
  const [roadMask, setRoadMask] = useState<RoadMask | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>("map");
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [productQuantity, setProductQuantity] = useState("1");
  const [showLayers, setShowLayers] = useState(false);
  const [showAllAddresses, setShowAllAddresses] = useState(true);
  const [addressTransferMessage, setAddressTransferMessage] = useState("");
  const [addressSearchPhase,setAddressSearchPhase]=useState<1|2>(1);
  const [addressSearchBlock,setAddressSearchBlock]=useState(3);
  const [addressSearchLot,setAddressSearchLot]=useState("");
  const [addressPrefilled,setAddressPrefilled]=useState(false);
  const [editingRoads,setEditingRoads]=useState(false);
  const [activeRoadPathId,setActiveRoadPathId]=useState<string|null>(null);
  const [showRoadValidation,setShowRoadValidation]=useState(false);
  const [selectedRoadPoint,setSelectedRoadPoint]=useState<{pathId:string;index:number}|null>(null);
  const [movingRoadPoint,setMovingRoadPoint]=useState(false);
  const [roadUndoCount,setRoadUndoCount]=useState(0);

  useEffect(() => {
    // If the map image was already cached by the browser, it can finish loading
    // before this component mounts and attaches onLoad -- in that case the
    // "load" event never fires at all, and roadMask would silently stay null
    // forever (breaking every route, with no visible error). This catches that.
    if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
      prepareMap(imgRef.current);
    }
  }, []);

  const owner = data.addresses.find((address) => address.isOwner) ?? null;
  const routeStart = data.addresses.find((address) => address.id === data.routeStartAddressId) ?? owner;
  const products = data.products ?? [];
  const selectedOrder = data.orders.find((order) => order.id === selectedOrderId) ?? null;
  const selectedAddress = data.addresses.find((address) => address.id === selectedAddressId) ?? null;
  const searchedLot=Number(addressSearchLot);
  const addressSearchActive=Number.isInteger(searchedLot)&&searchedLot>0;
  const addressMatches=data.addresses.filter((address)=>!address.isOwner&&(!addressSearchActive||(address.phase===addressSearchPhase&&address.block===addressSearchBlock&&address.lot===searchedLot)));
  const visibleOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.orders.filter((order) => {
      if (filter !== "all" && order.status !== filter) return false;
      if (!query) return true;
      const address = data.addresses.find((item) => item.id === order.addressId);
      return [order.customerName, order.phone, order.items, address ? addressLabel(address) : ""]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [data.addresses, data.orders, filter, search]);
  // Traced roads remain a draft until a future validation/publish workflow
  // explicitly activates them. Deliveries continue using image-based routing.
  const graphReady=roadNetwork.active===true&&hasRoadNetwork(roadNetwork);
  const roadValidation=useMemo(()=>validateRoadNetwork(
    roadNetwork,
    owner,
    data.addresses.filter((address)=>!address.isOwner),
  ),[roadNetwork,owner,data.addresses]);
  const roadGeometryResult=useMemo(()=>validateRoadGeometry(roadNetwork.paths.map((path)=>path.points),roadMask),[roadNetwork.paths,roadMask]);
  const roadGeometry={...roadGeometryResult,offRoadSegments:roadGeometryResult.offRoadSegments.length};
  const roadGeometryValid=roadGeometry.sampledPoints>0&&roadGeometry.coverage>=.9&&roadGeometry.offRoadSegments===0;
  const roadDraftValid=roadValidation.valid&&roadGeometryValid;
  const deliveryDistance=(from:Address,to:Address)=>graphReady?roadNetworkDistance(from,to,roadNetwork):roadOrStraightDistance(from,to,roadMask);
  const suggestedRoute = useMemo(() => {
    if (!routeStart) return [];
    const candidates = [...new Map(data.orders
      .filter((order) => order.status === "out-for-delivery")
      .map((order) => [order.addressId, data.addresses.find((address) => address.id === order.addressId)]))
      .values()]
      .filter((address): address is Address => Boolean(address));
    const ordered: Address[] = [];
    let current: Address = routeStart;
    const remaining = [...candidates];
    while (remaining.length) {
      let bestIndex = 0;
      let bestDist = deliveryDistance(current, remaining[0]);
      for (let index = 1; index < remaining.length; index += 1) {
        const d = deliveryDistance(current, remaining[index]);
        if (d < bestDist) { bestDist = d; bestIndex = index; }
      }
      current = remaining.splice(bestIndex, 1)[0];
      ordered.push(current);
    }
    return ordered;
  // deliveryDistance is intentionally derived from these routing inputs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.addresses, data.orders, routeStart, roadMask,roadNetwork,graphReady]);
  const manuallyPlannedRoute = routeAddressIds
    .map((id) => data.addresses.find((address) => address.id === id))
    .filter((address): address is Address => Boolean(address))
    .filter((address) => data.orders.some((order) => order.addressId === address.id && order.status === "out-for-delivery"));
  const routeAddresses = routeVisible ? (manuallyPlannedRoute.length ? manuallyPlannedRoute : suggestedRoute) : [];
  const routeKey = `${routeStart?.id ?? ""}:${routeAddresses.map((address) => address.id).join(",")}`;

  const routePaths = useMemo(() => {
    if ((!roadMask&&!graphReady) || !routeStart || !routeAddresses.length) return [];
    let current = routeStart;
    return routeAddresses.map((address) => {
      const path = graphReady?roadNetworkPath(current,address,roadNetwork):roadPath(current,address,roadMask!);
      current = address;
      return path;
    }).filter((path) => path.length > 1);
  // routeKey is the stable semantic dependency for the selected route.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roadMask, routeKey,roadNetwork,graphReady]);

  function resetForm() {
    setPendingPoint(null);
    setLot("");
    setCustomerName("");
    setPhone("");
    setItems("");
    setSelectedLines([]);
    setStatus("preparing");
    setNotes("");
    setSelectedProductId("");
    setProductQuantity("1");
    setAddressPrefilled(false);
  }

  function beginOwnerSetup() {
    setActiveTab("map");
    setEntryMode("owner");
    setSelectedOrderId(null);
    setSelectedAddressId(null);
    resetForm();
  }

  function beginOrder() {
    setActiveTab("map");
    setEntryMode("order");
    setSelectedOrderId(null);
    setSelectedAddressId(null);
    resetForm();
  }

  function beginAddressRegistration(prefill?:{phase:1|2;block:number;lot:number}){
    setActiveTab("map");setEntryMode("address");setSelectedOrderId(null);setSelectedAddressId(null);resetForm();
    setAddressPrefilled(Boolean(prefill));
    if(prefill){setPhase(prefill.phase);setBlock(prefill.block);setLot(String(prefill.lot));}
  }

  function beginOrderForAddress(address: Address) {
    setActiveTab("map");
    setEntryMode("order");
    setSelectedOrderId(null);
    setSelectedAddressId(address.id);
    setPhase(address.phase);
    setBlock(address.block);
    setLot(String(address.lot));
    const latestOrder = data.orders.find((order) => order.addressId === address.id);
    setCustomerName(address.customerName ?? latestOrder?.customerName ?? "");
    setPhone(address.phone ?? latestOrder?.phone ?? "");
    setItems("");
    setStatus("preparing");
    setNotes("");
    setSelectedProductId("");
    setProductQuantity("1");
    setPendingPoint({ x: address.x, y: address.y });
  }

  function onMapClick(event: React.MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button")) return;
    if (!mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    const point={
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
    if(editingRoads){
      setShowRoadValidation(false);
      if(movingRoadPoint&&selectedRoadPoint){
        commitRoadEdit((current)=>({...current,active:false,paths:current.paths.map((path)=>path.id===selectedRoadPoint.pathId?{...path,points:path.points.map((existing,index)=>index===selectedRoadPoint.index?point:existing)}:path)}));
        setMovingRoadPoint(false);
        return;
      }
      commitRoadEdit((current)=>{
        const pathId=activeRoadPathId??makeId("road");
        if(!activeRoadPathId)setActiveRoadPathId(pathId);
        const connection=activeRoadPathId?{point:nearestRoadPoint(point,current),network:current}:connectRoadPoint(point,current);
        const existing=connection.network.paths.find((path)=>path.id===pathId);
        return {...connection.network,active:false,paths:existing?connection.network.paths.map((path)=>path.id===pathId?{...path,points:[...path.points,connection.point]}:path):[...connection.network.paths,{id:pathId,points:[connection.point]}]};
      });
      return;
    }
    setPendingPoint(point);
    setSelectedOrderId(null);
    setSelectedAddressId(null);
  }

  function commitRoadEdit(update:(current:RoadNetwork)=>RoadNetwork){
    roadUndoStackRef.current=[...roadUndoStackRef.current,roadNetwork].slice(-50);
    setRoadUndoCount(roadUndoStackRef.current.length);
    setRoadNetwork(update(roadNetwork));
  }

  function undoRoadPoint(){
    const previous=roadUndoStackRef.current.at(-1);
    if(previous){roadUndoStackRef.current=roadUndoStackRef.current.slice(0,-1);setRoadUndoCount(roadUndoStackRef.current.length);setRoadNetwork(previous);setSelectedRoadPoint(null);setMovingRoadPoint(false);setShowRoadValidation(false);return;}
    if(!activeRoadPathId)return;
    setShowRoadValidation(false);
    setRoadNetwork((current)=>({...current,paths:current.paths.flatMap((path)=>path.id!==activeRoadPathId?[path]:path.points.length>1?[{...path,points:path.points.slice(0,-1)}]:[])}));
  }

  function deleteSelectedRoadPoint(){
    if(!selectedRoadPoint)return;
    commitRoadEdit((current)=>({...current,active:false,paths:current.paths.flatMap((path)=>{
      if(path.id!==selectedRoadPoint.pathId)return[path];
      const points=path.points.filter((_,index)=>index!==selectedRoadPoint.index);
      return points.length?[{...path,points}]:[];
    })}));
    setSelectedRoadPoint(null);setMovingRoadPoint(false);setShowRoadValidation(false);
  }

  function deleteActiveRoadPath(){
    if(!activeRoadPathId||!window.confirm("Delete this traced road path?"))return;
    commitRoadEdit((current)=>({...current,active:false,paths:current.paths.filter((path)=>path.id!==activeRoadPathId)}));
    setActiveRoadPathId(null);setSelectedRoadPoint(null);setMovingRoadPoint(false);setShowRoadValidation(false);
  }

  function insertRoadPoint(pathId:string,event:React.MouseEvent<SVGPolylineElement>){
    event.stopPropagation();
    if(!mapRef.current)return;
    const path=roadNetwork.paths.find((candidate)=>candidate.id===pathId);if(!path||path.points.length<2)return;
    const rect=mapRef.current.getBoundingClientRect();
    const target={x:Math.min(1,Math.max(0,(event.clientX-rect.left)/rect.width)),y:Math.min(1,Math.max(0,(event.clientY-rect.top)/rect.height))};
    let bestIndex=0,bestDistance=Infinity,bestPoint=target;
    for(let index=0;index<path.points.length-1;index++){
      const start=path.points[index],end=path.points[index+1],dx=(end.x-start.x)*2100,dy=(end.y-start.y)*1600;
      const px=(target.x-start.x)*2100,py=(target.y-start.y)*1600,lengthSquared=dx*dx+dy*dy;
      const ratio=lengthSquared?Math.max(0,Math.min(1,(px*dx+py*dy)/lengthSquared)):0;
      const projected={x:start.x+(end.x-start.x)*ratio,y:start.y+(end.y-start.y)*ratio};
      const nextDistance=Math.hypot((target.x-projected.x)*2100,(target.y-projected.y)*1600);
      if(nextDistance<bestDistance){bestDistance=nextDistance;bestIndex=index;bestPoint=projected;}
    }
    const insertedIndex=bestIndex+1;
    commitRoadEdit((current)=>({...current,active:false,paths:current.paths.map((candidate)=>candidate.id===pathId?{...candidate,points:[...candidate.points.slice(0,insertedIndex),bestPoint,...candidate.points.slice(insertedIndex)]}:candidate)}));
    setActiveRoadPathId(pathId);setSelectedRoadPoint({pathId,index:insertedIndex});setMovingRoadPoint(false);setShowRoadValidation(false);
  }

  function finishRoadEditing(){setEditingRoads(false);setActiveRoadPathId(null);setSelectedRoadPoint(null);setMovingRoadPoint(false);roadUndoStackRef.current=[];setRoadUndoCount(0);setShowLayers(false);}

  function saveEntry() {
    const numericLot = Number(lot);
    if (!pendingPoint || !Number.isInteger(numericLot) || numericLot < 1) return;
    const existing = data.addresses.find(
      (address) => address.phase === phase && address.block === block && address.lot === numericLot,
    );
    const address: Address = existing ?? {
      id: makeId("address"),
      phase,
      block,
      lot: numericLot,
      x: pendingPoint.x,
      y: pendingPoint.y,
      isOwner: false,
      createdAt: new Date().toISOString(),
    };

    if (entryMode === "owner") {
      setData((current) => ({
        ...current,
        addresses: [
          ...current.addresses.filter((item) => item.id !== address.id && !item.isOwner),
          { ...address, x: pendingPoint.x, y: pendingPoint.y, isOwner: true },
        ],
      }));
      setSelectedAddressId(address.id);
      resetForm();
      return;
    }

    if(entryMode==="address"){
      const savedAddress={...address,x:pendingPoint.x,y:pendingPoint.y,customerName:customerName.trim()||address.customerName,phone:phone.trim()||address.phone};
      setData((current)=>({...current,addresses:existing?current.addresses.map((item)=>item.id===existing.id?savedAddress:item):[...current.addresses,savedAddress]}));
      setSelectedAddressId(savedAddress.id);setEntryMode("order");resetForm();return;
    }

    if (!customerName.trim() || !items.trim()) return;
    const newOrder: Order = {
      id: makeId("order"),
      addressId: address.id,
      customerName: customerName.trim(),
      phone: phone.trim(),
      items: items.trim(),
      lineItems:selectedLines,
      total:selectedLines.reduce((sum,line)=>sum+line.quantity*line.unitPrice,0),
      paymentStatus:"unpaid",
      status,
      notes: notes.trim(),
      createdAt: new Date().toISOString(),
    };
    const addressWithContact: Address = {
      ...address,
      customerName: customerName.trim(),
      phone: phone.trim(),
    };
    setData((current) => ({
      ...current,
      addresses: existing
        ? current.addresses.map((item) => item.id === existing.id ? addressWithContact : item)
        : [...current.addresses, addressWithContact],
      orders: [newOrder, ...current.orders],
    }));
    setSelectedOrderId(newOrder.id);
    setSelectedAddressId(address.id);
    resetForm();
  }

  function updateStatus(orderId: string, nextStatus: DeliveryStatus) {
    const hasRemainingDelivery = data.orders.some((order) => order.id !== orderId && order.status === "out-for-delivery");
    setPendingRouteStartOrderId(nextStatus === "delivered" && hasRemainingDelivery ? orderId : null);
    setData((current) => {
      return {
        ...current,
        orders: current.orders.map((order) => order.id === orderId ? { ...order, status: nextStatus, deliveredAt: nextStatus === "delivered" ? order.deliveredAt ?? new Date().toISOString() : undefined } : order),
        routeStartAddressId: nextStatus === "delivered" && !hasRemainingDelivery ? undefined : current.routeStartAddressId,
      };
    });
  }

  function updateRouteStart(addressId: string, enabled: boolean) {
    setPendingRouteStartOrderId(null);
    setData((current) => ({
      ...current,
      routeStartAddressId: enabled ? addressId : undefined,
    }));
  }

  function addProduct() {
    const price = Number(productPrice);
    if (!productName.trim() || !Number.isFinite(price) || price < 0) return;
    const product: Product = { id: makeId("product"), name: productName.trim(), price, active: true, createdAt: new Date().toISOString() };
    setData((current) => ({ ...current, products: [...(current.products ?? []), product] }));
    setProductName(""); setProductPrice("");
  }

  function toggleProduct(productId: string) {
    setData((current) => ({ ...current, products: (current.products ?? []).map((product) => product.id === productId ? { ...product, active: !product.active } : product) }));
  }

  function updateAddress(addressId:string,patch:Pick<Address,"phase"|"block"|"lot"|"customerName"|"phone">){
    const duplicate=data.addresses.some((address)=>address.id!==addressId&&address.phase===patch.phase&&address.block===patch.block&&address.lot===patch.lot);
    if(duplicate){window.alert("That phase, block, and lot is already registered.");return false;}
    setData((current)=>({...current,addresses:current.addresses.map((address)=>address.id===addressId?{...address,...patch}:address)}));return true;
  }
  function deleteAddress(addressId:string){
    const orderCount=data.orders.filter((order)=>order.addressId===addressId).length;
    if(!window.confirm(orderCount?`Delete this address and its ${orderCount} order(s)? This cannot be undone.`:"Delete this address? This cannot be undone."))return;
    setData((current)=>({...current,addresses:current.addresses.filter((address)=>address.id!==addressId),orders:current.orders.filter((order)=>order.addressId!==addressId),routeStartAddressId:current.routeStartAddressId===addressId?undefined:current.routeStartAddressId}));
    setSelectedAddressId(null);setSelectedOrderId(null);
  }
  function updateOrder(orderId:string,patch:Partial<Pick<Order,"customerName"|"phone"|"items"|"notes"|"paymentStatus"|"lineItems"|"total">>){setData((current)=>({...current,orders:current.orders.map((order)=>order.id===orderId?{...order,...patch}:order)}));}
  function deleteOrder(orderId:string){if(!window.confirm("Delete this order? This cannot be undone."))return;setData((current)=>({...current,orders:current.orders.filter((order)=>order.id!==orderId)}));setSelectedOrderId(null);setPendingRouteStartOrderId(null);}
  function updateProduct(productId:string,patch:Pick<Product,"name"|"price">){setData((current)=>({...current,products:current.products.map((product)=>product.id===productId?{...product,...patch}:product)}));}
  function deleteProduct(productId:string){if(!window.confirm("Delete this product? Existing orders will keep their saved product details."))return;setData((current)=>({...current,products:current.products.filter((product)=>product.id!==productId)}));}

  function downloadBackup(type:string,value:unknown){const payload=JSON.stringify({type:`sweet-route-${type}`,version:1,exportedAt:new Date().toISOString(),[type]:value},null,2);const url=URL.createObjectURL(new Blob([payload],{type:"application/json"}));const link=document.createElement("a");link.href=url;link.download=`sweet-route-${type}-${new Date().toISOString().slice(0,10)}.json`;link.click();URL.revokeObjectURL(url);setAddressTransferMessage(`${type[0].toUpperCase()+type.slice(1)} backup exported.`);}
  async function importBackup(file:File,type:"orders"|"products"|"data"){
    try{
      const parsed=JSON.parse(await file.text()) as Record<string,unknown>;if(parsed.type!==`sweet-route-${type}`)throw new Error("Wrong backup type");
      if(type==="data"){
        const restored=parsed.data as AppData&{roadNetwork?:typeof roadNetwork};if(!restored||!Array.isArray(restored.addresses)||!Array.isArray(restored.orders)||!Array.isArray(restored.products))throw new Error("Invalid full backup");
        if(!window.confirm("Replace all local addresses, orders, and products with this full backup?"))return;
        setData({addresses:restored.addresses,orders:restored.orders,products:restored.products,routeStartAddressId:restored.routeStartAddressId});if(restored.roadNetwork?.version===1&&Array.isArray(restored.roadNetwork.paths))setRoadNetwork(restored.roadNetwork);setAddressTransferMessage("Full backup restored, including its road draft when available.");return;
      }
      const records=parsed[type];if(!Array.isArray(records))throw new Error("Invalid backup");
      setData((current)=>{const merged=new Map((current[type] as Array<{id:string}>).map((record)=>[record.id,record]));(records as Array<{id:string}>).filter((record)=>record&&typeof record.id==="string").forEach((record)=>merged.set(record.id,record));return{...current,[type]:[...merged.values()]};});
      setAddressTransferMessage(`${records.length} ${type} restored; existing records were kept.`);
    }catch{setAddressTransferMessage(`That file is not a valid Sweet Route ${type} backup.`);}
    finally{if(orderImportRef.current)orderImportRef.current.value="";if(productImportRef.current)productImportRef.current.value="";if(fullImportRef.current)fullImportRef.current.value="";}
  }

  async function importRoadBackup(file:File){
    try{
      const parsed=JSON.parse(await file.text()) as {type?:string;roads?:typeof roadNetwork};
      if(parsed.type!=="sweet-route-roads"||parsed.roads?.version!==1||!Array.isArray(parsed.roads.paths))throw new Error("Invalid road backup");
      if(!window.confirm("Replace the current road draft with this backup?"))return;
      setRoadNetwork({...parsed.roads,active:false});setAddressTransferMessage(`${parsed.roads.paths.length} road path${parsed.roads.paths.length===1?"":"s"} restored. Validate before activation.`);
    }catch{setAddressTransferMessage("That file is not a valid Sweet Route road backup.");}
    finally{if(roadImportRef.current)roadImportRef.current.value="";}
  }

  function exportAddresses() {
    const payload = JSON.stringify({ type: "sweet-route-addresses", version: 1, exportedAt: new Date().toISOString(), addresses: data.addresses }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `sweet-route-addresses-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setAddressTransferMessage(`${data.addresses.length} address${data.addresses.length === 1 ? "" : "es"} exported.`);
  }

  async function importAddresses(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as { type?: string; addresses?: Address[] };
      if (parsed.type !== "sweet-route-addresses" || !Array.isArray(parsed.addresses)) throw new Error("Invalid address backup");
      const valid = parsed.addresses.filter((address) => address && typeof address.id === "string" && (address.phase === 1 || address.phase === 2) && Number.isFinite(address.block) && Number.isFinite(address.lot) && Number.isFinite(address.x) && Number.isFinite(address.y));
      if (!valid.length && parsed.addresses.length) throw new Error("No valid addresses found");
      setData((current) => {
        const merged = new Map(current.addresses.map((address) => [`${address.phase}:${address.block}:${address.lot}`, address]));
        valid.forEach((address) => merged.set(`${address.phase}:${address.block}:${address.lot}`, address));
        return { ...current, addresses: [...merged.values()] };
      });
      setAddressTransferMessage(`${valid.length} address${valid.length === 1 ? "" : "es"} imported. Existing orders and products were kept.`);
    } catch {
      setAddressTransferMessage("That file is not a valid Sweet Route address backup.");
    } finally {
      if (addressImportRef.current) addressImportRef.current.value = "";
    }
  }

  function appendSelectedProduct() {
    const product = products.find((item) => item.id === selectedProductId);
    const quantity = Number(productQuantity);
    if (!product || !Number.isInteger(quantity) || quantity < 1) return;
    const lineItem = `${quantity} × ${product.name}`;
    setSelectedLines((current)=>[...current,{productId:product.id,name:product.name,quantity,unitPrice:product.price}]);
    setItems((current) => current.trim() ? `${current.trim()}, ${lineItem}` : lineItem);
    setSelectedProductId("");
    setProductQuantity("1");
  }

  function planRoute() {
    setRouteAddressIds(suggestedRoute.map((address) => address.id));
    setRouteVisible(true);
  }

  function recenterOwner() {
    if (!owner || !mapViewportRef.current || !mapRef.current) return;
    const viewport = mapViewportRef.current;
    const surface = mapRef.current;
    viewport.scrollTo({ left: Math.max(0, owner.x * surface.offsetWidth - viewport.clientWidth / 2), top: Math.max(0, owner.y * surface.offsetHeight - viewport.clientHeight / 2), behavior: "smooth" });
  }

  function resetMapView() {
    setZoom(minimumZoom);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const viewport = mapViewportRef.current, surface = mapRef.current;
      if (viewport && surface) viewport.scrollTo({ left: Math.max(0, (surface.offsetWidth - viewport.clientWidth) / 2), top: Math.max(0, (surface.offsetHeight - viewport.clientHeight) / 2) });
    }));
  }

  function prepareMap(image: HTMLImageElement) {
    setRoadMask(createRoadMask(image));
    if (window.innerWidth <= 720 && mapViewportRef.current) {
      const viewport = mapViewportRef.current;
      const imageHeightAtWidth = viewport.clientWidth * image.naturalHeight / image.naturalWidth;
      const coverZoom = Math.max(1, viewport.clientHeight / imageHeightAtWidth) * 1.08;
      setMinimumZoom(coverZoom);
      setZoom((current) => Math.max(current, coverZoom));
    }
  }

  const preparingCount = data.orders.filter((order) => order.status === "preparing").length;
  const readyCount = data.orders.filter((order) => order.status === "ready").length;
  const deliveredCount = data.orders.filter((order) => order.status === "delivered").length;

  return (
    <main className="delivery-app">
      <header className="app-header">
        <div className="brand-mark">
          {/* Static brand artwork is intentionally rendered without image optimization. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${BASE_PATH}/icon-192.png`} alt="" aria-hidden="true" />
        </div>
        <div className="brand-copy">
          <p>PHirst Park Homes</p>
          <h1>Sweet Route</h1>
        </div>
        <div className="header-summary">
          <span className="save-chip">● Saved locally</span>
          <button className="ghost-button" onClick={beginOwnerSetup}>{owner ? "Edit home pin" : "Set owner home"}</button>
          <button className="primary-button" onClick={beginOrder}>+ New order</button>
        </div>
      </header>

      <section className={`main-layout view-${activeTab}`}>
        <aside className="order-panel">
          {activeTab === "today" && <><div className="today-intro"><p className="eyebrow">Today</p><h2>Ready to deliver something sweet?</h2><div className="stats-grid"><article><span>Preparing</span><strong>{preparingCount}</strong></article><article><span>Ready</span><strong>{readyCount}</strong></article><article><span>Delivered</span><strong>{deliveredCount}</strong></article></div></div><SalesDashboard orders={data.orders} addresses={data.addresses}/></>}
          <div className="panel-title"><div><p>{activeTab === "today" ? "Today’s queue" : "Orders"}</p><h2>{visibleOrders.length} shown</h2></div><button className="route-button" disabled={!owner} onClick={() => { planRoute(); setActiveTab("map"); }}>Plan route</button></div>
          {routeAddresses.length > 0 && <div className="route-summary"><strong>{routeAddresses.length} stop{routeAddresses.length === 1 ? "" : "s"}</strong><span>Starting from {routeStart ? addressLabel(routeStart) : "owner home"}</span><button onClick={() => { setRouteAddressIds([]); setRouteVisible(false); }}>Clear</button></div>}
          {data.routeStartAddressId && routeStart && <div className="active-route-start"><span>Current route position: <strong>{addressLabel(routeStart)}</strong></span><button onClick={() => updateRouteStart(routeStart.id, false)}>Start from home</button></div>}
          <input className="search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customer or address" />
          <div className="filter-row">
            {(["all", "preparing", "ready", "out-for-delivery", "delivered"] as const).map((value) => (
              <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "all" ? "All" : statusLabel[value]}</button>
            ))}
          </div>
          <div className="order-list">
            {visibleOrders.map((order) => {
              const address = data.addresses.find((item) => item.id === order.addressId);
              return <button key={order.id} className={`order-card ${selectedOrderId === order.id ? "selected" : ""}`} onClick={() => { setSelectedOrderId(order.id); setSelectedAddressId(order.addressId); setActiveTab("map"); }}>
                <span className={`status-pill ${order.status}`}>{statusLabel[order.status]}</span>
                <strong>{order.customerName}</strong>
                <small>{address ? addressLabel(address) : "Address missing"}</small>
                <small>{order.items}</small>
              </button>;
            })}
            {!visibleOrders.length && <div className="empty-list">No orders yet. Add your first one from the map.</div>}
          </div>
        </aside>

        <section className="map-card">
          <div className="map-bar">
            <div><strong>{data.addresses.length}</strong> saved addresses <span>·</span> <strong>{data.orders.filter((order) => order.status === "ready").length}</strong> ready today</div>
            <div className="map-controls"><button onClick={() => setZoom((value) => Math.max(minimumZoom, value - .25))}>−</button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom((value) => Math.min(MAX_MAP_ZOOM, value + .25))}>+</button><button onClick={resetMapView}>Reset</button></div>
          </div>
          <button className="layers-button" onClick={() => setShowLayers((value) => !value)}>Layers</button>
          {showLayers && <div className="layers-popover"><strong>Map layers</strong><label><input type="checkbox" checked={routeVisible} onChange={(event) => setRouteVisible(event.target.checked)} /> Delivery route</label><label><input type="checkbox" checked={showAllAddresses} onChange={(event) => setShowAllAddresses(event.target.checked)} /> All saved addresses</label><button className="road-edit-toggle" onClick={()=>{setRoadNetwork((current)=>({...current,active:false}));setEditingRoads(true);setShowLayers(false);setShowRoadValidation(false);setPendingPoint(null);setSelectedAddressId(null);setSelectedOrderId(null);}}>Edit road draft</button><button className="road-validate-toggle" disabled={!roadNetwork.paths.length} onClick={()=>setShowRoadValidation(true)}>Validate road network</button>{showRoadValidation&&<div className={`road-validation ${roadDraftValid?"valid":"invalid"}`}><strong>{roadDraftValid?"Road network is valid":"Draft needs attention"}</strong><span>{roadValidation.usablePaths} traced path{roadValidation.usablePaths===1?"":"s"} · {roadValidation.components} connected section{roadValidation.components===1?"":"s"}</span><span>{Math.round(roadGeometry.coverage*100)}% of the draft follows detected roads.</span>{roadGeometry.offRoadSegments>0&&<span>{roadGeometry.offRoadSegments} segment{roadGeometry.offRoadSegments===1?" crosses":"s cross"} houses or other non-road areas.</span>}{roadValidation.incompletePaths>0&&<span>{roadValidation.incompletePaths} unfinished path{roadValidation.incompletePaths===1?"":"s"}</span>}{!owner&&<span>Set an owner home first.</span>}{roadValidation.unreachablePoints>0&&<span>{roadValidation.unreachablePoints} address{roadValidation.unreachablePoints===1?" is":"es are"} unreachable from home.</span>}</div>}<label className="road-routing-toggle"><input type="checkbox" role="switch" checked={roadNetwork.active===true} disabled={!roadNetwork.paths.length} onChange={(event)=>{if(!event.target.checked){setRoadNetwork((current)=>({...current,active:false}));return;}setShowRoadValidation(true);if(roadDraftValid)setRoadNetwork((current)=>({...current,active:true}));}}/><span className="road-switch" aria-hidden="true"/><span><strong>Use road draft</strong><small>{roadNetwork.active?"On — traced-road routing":"Off — default image routing"}</small></span></label><small>{roadNetwork.active?"Traced-road routing is active":`Image routing is active${roadNetwork.paths.length?` · ${roadNetwork.paths.length} draft path${roadNetwork.paths.length===1?"":"s"} saved`:""}`}</small></div>}
          {editingRoads&&<div className="road-editor-legend" aria-label="Road editor legend"><strong>Road editor key</strong><span><i className="road-key-line saved"/>Saved path</span><span><i className="road-key-line active"/>Active path</span><span><i className="road-key-point"/>Editable point</span><span><i className="road-key-point selected"/>Selected point</span><span><i className="road-key-line issue"/>Needs correction</span></div>}
          <div ref={mapViewportRef} className="map-viewport" onClick={onMapClick}>
            <div ref={mapRef} className={`map-surface ${editingRoads?"editing-roads":""}`} style={{ width: `${zoom * 100}%` }}>
              {/* A native image is required because routing samples its pixels through canvas. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img ref={imgRef} src={`${BASE_PATH}/subdivision-map.png`} alt="PHirst Park Homes subdivision map" draggable={false} onLoad={(event) => prepareMap(event.currentTarget)} />
              {routePaths.length > 0 && (
                <svg className="route-layer" viewBox="0 0 2100 1600" width="2100" height="1600" preserveAspectRatio="xMinYMin meet" aria-label="Suggested delivery route">
                  {routePaths.map((path, index) => (
                    <polyline key={index} points={path.map((point) => `${point.x * 2100},${point.y * 1600}`).join(" ")} />
                  ))}
                </svg>
              )}
              {editingRoads&&<svg className="road-editor-layer" viewBox="0 0 2100 1600" width="2100" height="1600" preserveAspectRatio="xMinYMin meet" aria-label="Road network editor">{roadNetwork.paths.map((path)=><g className={path.points.length<2?"incomplete-path":undefined} key={path.id}><polyline className={path.id===activeRoadPathId?"active":""} points={path.points.map((point)=>`${point.x*2100},${point.y*1600}`).join(" ")} onClick={(event)=>insertRoadPoint(path.id,event)}/>{path.points.length===1&&<circle className="incomplete-halo" cx={path.points[0].x*2100} cy={path.points[0].y*1600} r="24"/>}{path.points.map((point,index)=><circle className={selectedRoadPoint?.pathId===path.id&&selectedRoadPoint.index===index?"selected-road-point":undefined} key={index} cx={point.x*2100} cy={point.y*1600} r="9" onClick={(event)=>{event.stopPropagation();setActiveRoadPathId(path.id);setSelectedRoadPoint({pathId:path.id,index});setMovingRoadPoint(false);}}/>)}</g>)}{roadGeometryResult.offRoadSegments.map(({pathIndex,segmentIndex})=>{const points=roadNetwork.paths[pathIndex]?.points.slice(segmentIndex,segmentIndex+2)??[];return points.length===2?<polyline className="off-road" key={`${pathIndex}:${segmentIndex}`} points={points.map((point)=>`${point.x*2100},${point.y*1600}`).join(" ")}/>:null;})}</svg>}
              {data.addresses.filter((address) => showAllAddresses || address.isOwner || data.orders.some((order) => order.addressId === address.id && !["delivered", "cancelled"].includes(order.status))).map((address) => (
                <button key={address.id} className={`address-pin ${address.isOwner ? "owner" : ""} ${selectedAddressId === address.id ? "selected" : ""}`} style={{ left: `${address.x * 100}%`, top: `${address.y * 100}%` }} title={addressLabel(address)} onClick={(event) => { event.stopPropagation(); setSelectedAddressId(address.id); }}>
                  {address.isOwner ? "⌂" : "●"}
                </button>
              ))}
              {routeAddresses.map((address, index) => <span key={`stop-${address.id}`} className="route-stop" style={{ left: `${address.x * 100}%`, top: `${address.y * 100}%` }}>{index + 1}</span>)}
              {pendingPoint && <div className="pending-pin" style={{ left: `${pendingPoint.x * 100}%`, top: `${pendingPoint.y * 100}%` }}>+</div>}
            </div>
          </div>
          <p className="map-hint">Drag the map, use the zoom controls, then tap the exact customer lot to create a pin. Route lines are an offline road guide and should be checked before leaving.</p>
          <div className="map-action-stack"><button onClick={() => setZoom((value) => Math.min(MAX_MAP_ZOOM, value + .25))}>+</button><button onClick={() => setZoom((value) => Math.max(minimumZoom, value - .25))}>−</button><button disabled={!owner} onClick={recenterOwner}>⌂</button></div>
          {editingRoads?<div className="road-editor-toolbar"><div><strong>{movingRoadPoint?"Tap the corrected road position":"Trace road centers"}</strong><small>{selectedRoadPoint?"Selected point can be moved or deleted.":roadValidation.incompletePaths?"The pulsing red marker is an unfinished path. Select it to continue or delete it.":"Tap a point to edit it, or tap the road to keep tracing."}</small></div><button disabled={!activeRoadPathId&&!roadUndoCount} onClick={undoRoadPoint}>Undo</button><button disabled={!selectedRoadPoint} onClick={()=>setMovingRoadPoint(true)}>Move point</button><button disabled={!selectedRoadPoint} onClick={deleteSelectedRoadPoint}>Delete point</button><button disabled={!activeRoadPathId} onClick={deleteActiveRoadPath}>Delete path</button><button onClick={()=>{setActiveRoadPathId(null);setSelectedRoadPoint(null);setMovingRoadPoint(false);}}>New path</button><button className="road-editor-done" onClick={finishRoadEditing}>Done</button><button className="road-editor-clear" disabled={!roadNetwork.paths.length} onClick={()=>{if(window.confirm("Remove the entire traced road network?")){commitRoadEdit(()=>({version:1,paths:[],active:false}));setActiveRoadPathId(null);setSelectedRoadPoint(null);}}}>Clear</button></div>:isHydrated && (entryMode==="address"&&!pendingPoint?<button className="map-add-button map-home-button" disabled>Tap map to pin</button>:owner ? <button className="map-add-button" onClick={beginOrder}>+ New order</button> : entryMode !== "owner" ? <button className="map-add-button map-home-button" onClick={beginOwnerSetup}>⌂ Set home location</button> : null)}
        </section>

        <aside className={`entry-panel ${!owner && !pendingPoint ? "owner-required" : ""}`}>
          {pendingPoint ? <>
            <div className="panel-title"><div><p>{entryMode === "owner" ? "Owner setup" : entryMode==="address"?"Address registration":"New order"}</p><h2>{entryMode === "owner" ? "Save delivery home" : entryMode==="address"?"Pin this address":"Save customer location"}</h2></div><button className="close-button" onClick={()=>{resetForm();if(entryMode==="address")setEntryMode("order");}}>×</button></div>
            <div className="entry-form">
              <label>Phase<select value={phase} onChange={(event) => { const nextPhase = Number(event.target.value) as 1 | 2; setPhase(nextPhase); if (!VALID_BLOCKS[nextPhase].includes(block)) setBlock(VALID_BLOCKS[nextPhase][0]); }}><option value={1}>Phase 1</option><option value={2}>Phase 2</option></select></label>
              <label>Block<select value={block} onChange={(event) => setBlock(Number(event.target.value))}>{VALID_BLOCKS[phase].map((value) => <option key={value} value={value}>Block {value}</option>)}</select></label>
              <label className="full">Lot<input inputMode="numeric" value={lot} onChange={(event) => setLot(event.target.value.replace(/\D/g, ""))} placeholder="Lot number" autoFocus /></label>
              {entryMode === "order" && <>
                <label className="full">Customer name<input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Customer name" /></label>
                <label>Contact<input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Optional" /></label>
                <label>Status<select value={status} onChange={(event) => setStatus(event.target.value as DeliveryStatus)}>{(["preparing", "ready", "out-for-delivery", "delivered", "cancelled"] as const).map((value) => <option key={value} value={value}>{statusLabel[value]}</option>)}</select></label>
                {products.some((product) => product.active) && <div className="product-picker full"><label>Product<select value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)}><option value="">Choose a product</option>{products.filter((product) => product.active).map((product) => <option key={product.id} value={product.id}>{product.name} — ₱{product.price.toFixed(2)}</option>)}</select></label><label className="quantity-field">Qty<input type="number" inputMode="numeric" min="1" step="1" value={productQuantity} onChange={(event) => setProductQuantity(event.target.value.replace(/\D/g, ""))} /></label><button type="button" disabled={!selectedProductId || Number(productQuantity) < 1} onClick={appendSelectedProduct}>Add</button></div>}
                {items && <div className="selected-items full"><div><span>Selected products</span><strong>{items}</strong>{selectedLines.length>0&&<small>Total: ₱{selectedLines.reduce((sum,line)=>sum+line.quantity*line.unitPrice,0).toFixed(2)}</small>}</div><button type="button" onClick={() => {setItems("");setSelectedLines([]);}}>Clear</button></div>}
                <label className="full">Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Landmark, payment, or special note" /></label>
              </>}
              {entryMode==="address"&&<><p className="prefilled-address full">{addressPrefilled?"Address copied from your search. ":""}Tap confirmed—add an optional customer name or contact.</p><label className="full">Customer name<input value={customerName} onChange={(event)=>setCustomerName(event.target.value)} placeholder="Optional"/></label><label className="full">Contact<input value={phone} onChange={(event)=>setPhone(event.target.value)} placeholder="Optional"/></label></>}
              <button className="primary-button full" disabled={!lot || (entryMode === "order" && (!customerName || !items))} onClick={saveEntry}>{entryMode === "owner" ? "Save owner home" : entryMode==="address"?"Save address pin":"Add order and pin"}</button>
            </div>
          </> : selectedOrder ? <OrderDetails order={selectedOrder} address={data.addresses.find((item) => item.id === selectedOrder.addressId)} products={products} routeStartAddressId={data.routeStartAddressId} showRouteStartPrompt={pendingRouteStartOrderId === selectedOrder.id} onStatus={updateStatus} onRouteStart={updateRouteStart} onUpdate={updateOrder} onDelete={deleteOrder} onClose={() => { setPendingRouteStartOrderId(null); setSelectedOrderId(null); setSelectedAddressId(null); }} /> : selectedAddress && !selectedAddress.isOwner ? <AddressDetails address={selectedAddress} orders={data.orders.filter((order) => order.addressId === selectedAddress.id)} products={products} routeStartAddressId={data.routeStartAddressId} pendingRouteStartOrderId={pendingRouteStartOrderId} onStatus={updateStatus} onRouteStart={updateRouteStart} onUpdateOrder={updateOrder} onDeleteOrder={deleteOrder} onUpdateAddress={updateAddress} onDeleteAddress={deleteAddress} onAdd={() => beginOrderForAddress(selectedAddress)} onClose={() => { setPendingRouteStartOrderId(null); setSelectedAddressId(null); }} /> : entryMode==="address" ? <div className="owner-tap-hint"><span>⌖</span><div><strong>Tap Phase {phase}, Block {block}, Lot {lot}</strong><small>Drag or zoom first, then tap its exact position.</small></div></div> : !owner && entryMode === "owner" ? <div className="owner-tap-hint"><span>⌖</span><div><strong>Tap your home lot</strong><small>Drag or zoom the map first.</small></div></div> : <div className="empty-entry"><div className="tap-icon">⌖</div><h2>{owner ? "Tap a customer lot" : "Set your home first"}</h2><p>{owner ? "A form will open with the exact pixel you tapped." : "Save your delivery start point before adding orders."}</p><button className="primary-button" onClick={owner ? beginOrder : beginOwnerSetup}>{owner ? "Add order" : "Set owner home"}</button></div>}
        </aside>
        {activeTab === "addresses" && <section className="settings-overlay address-book">
          <div className="address-book-title"><div><p className="eyebrow">Reusable locations</p><h2>Addresses & backups</h2></div><button className="primary-button" onClick={()=>beginAddressRegistration()}>+ Register on map</button></div>
          <AddressSearch phase={addressSearchPhase} block={addressSearchBlock} lot={addressSearchLot} resultCount={addressMatches.length} active={addressSearchActive} onPhase={(next)=>{setAddressSearchPhase(next);setAddressSearchBlock(VALID_BLOCKS[next][0]);}} onBlock={setAddressSearchBlock} onLot={setAddressSearchLot} onClear={()=>setAddressSearchLot("")} onAdd={()=>beginAddressRegistration({phase:addressSearchPhase,block:addressSearchBlock,lot:searchedLot})}/>
          <div className="backup-center"><BackupRow title="Addresses" count={data.addresses.length} onExport={exportAddresses} onImport={()=>addressImportRef.current?.click()}/><BackupRow title="Orders" count={data.orders.length} onExport={()=>downloadBackup("orders",data.orders)} onImport={()=>orderImportRef.current?.click()}/><BackupRow title="Products" count={products.length} onExport={()=>downloadBackup("products",products)} onImport={()=>productImportRef.current?.click()}/><BackupRow title="Road draft" count={roadNetwork.paths.length} onExport={()=>downloadBackup("roads",roadNetwork)} onImport={()=>roadImportRef.current?.click()}/><BackupRow title="Full app" count={data.addresses.length+data.orders.length+products.length+roadNetwork.paths.length} onExport={()=>downloadBackup("data",{...data,roadNetwork})} onImport={()=>fullImportRef.current?.click()}/><input ref={addressImportRef} type="file" accept="application/json,.json" onChange={(event)=>{const file=event.target.files?.[0];if(file)void importAddresses(file);}}/><input ref={orderImportRef} type="file" accept="application/json,.json" onChange={(event)=>{const file=event.target.files?.[0];if(file)void importBackup(file,"orders");}}/><input ref={productImportRef} type="file" accept="application/json,.json" onChange={(event)=>{const file=event.target.files?.[0];if(file)void importBackup(file,"products");}}/><input ref={roadImportRef} type="file" accept="application/json,.json" onChange={(event)=>{const file=event.target.files?.[0];if(file)void importRoadBackup(file);}}/><input ref={fullImportRef} type="file" accept="application/json,.json" onChange={(event)=>{const file=event.target.files?.[0];if(file)void importBackup(file,"data");}}/>{addressTransferMessage&&<p>{addressTransferMessage}</p>}</div>
          {owner&&<button className="owner-row" onClick={beginOwnerSetup}><span>⌂</span><div><strong>Owner home</strong><small>{addressLabel(owner)}</small></div><b>›</b></button>}
          {addressMatches.map((address)=><div className="address-book-row" key={address.id}><button className="address-main" onClick={()=>{setSelectedAddressId(address.id);setSelectedOrderId(null);setActiveTab("map");}}><span>⌖</span><div><strong>{addressLabel(address)}</strong><small>{data.orders.filter((order)=>order.addressId===address.id).length} order(s)</small></div></button><button className="address-add" onClick={()=>beginOrderForAddress(address)}>+ Order</button></div>)}
          {!addressMatches.length&&!addressSearchActive&&<div className="empty-list">No customer addresses yet. Import a backup or register a new one on the map.</div>}
        </section>}
        {activeTab === "products" && <section className="settings-overlay product-manager"><div className="address-book-title"><div><p className="eyebrow">Menu catalog</p><h2>Products</h2></div></div><div className="product-form"><label>Product name<input value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="e.g. Mango Graham Tub" /></label><label>Price<input type="number" min="0" step="0.01" value={productPrice} onChange={(event) => setProductPrice(event.target.value)} placeholder="0.00" /></label><button className="primary-button" disabled={!productName.trim() || productPrice === ""} onClick={addProduct}>Add product</button></div><div className="product-list">{products.map((product)=><ProductRow key={product.id} product={product} onToggle={toggleProduct} onUpdate={updateProduct} onDelete={deleteProduct}/>)}{!products.length && <div className="empty-list">No products yet. Add your desserts here for faster order entry.</div>}</div></section>}
      </section>
      <nav className="bottom-nav" aria-label="Main navigation">
        {(["today", "map", "orders", "products", "addresses"] as AppTab[]).map((tab) => <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}><span>{tab === "today" ? "⌂" : tab === "map" ? "⌖" : tab === "orders" ? "▤" : tab === "products" ? "◇" : "◆"}</span>{tab[0].toUpperCase() + tab.slice(1)}</button>)}
      </nav>
    </main>
  );
}

function BackupRow({title,count,onExport,onImport}:{title:string;count:number;onExport:()=>void;onImport:()=>void}){return <div className="backup-row"><div><strong>{title}</strong><small>{count} record{count===1?"":"s"}</small></div><div><button disabled={!count} onClick={onExport}>Export</button><button onClick={onImport}>Restore</button></div></div>;}

function AddressSearch({phase,block,lot,resultCount,active,onPhase,onBlock,onLot,onClear,onAdd}:{phase:1|2;block:number;lot:string;resultCount:number;active:boolean;onPhase:(phase:1|2)=>void;onBlock:(block:number)=>void;onLot:(lot:string)=>void;onClear:()=>void;onAdd:()=>void}){return <div className="address-search"><div className="address-search-fields"><label>Phase<select value={phase} onChange={(event)=>onPhase(Number(event.target.value) as 1|2)}><option value="1">Phase 1</option><option value="2">Phase 2</option></select></label><label>Block<select value={block} onChange={(event)=>onBlock(Number(event.target.value))}>{VALID_BLOCKS[phase].map((value)=><option key={value} value={value}>Block {value}</option>)}</select></label><label>Lot<input inputMode="numeric" value={lot} onChange={(event)=>onLot(event.target.value.replace(/\D/g,""))} placeholder="Lot"/></label>{active&&<button className="search-clear" onClick={onClear}>Clear</button>}</div>{active&&(resultCount?<p className="search-result found">Address found below.</p>:<div className="search-result missing"><span>No saved address for Phase {phase}, Block {block}, Lot {lot}.</span><button onClick={onAdd}>+ Add this address</button></div>)}</div>;}

function ProductRow({product,onToggle,onUpdate,onDelete}:{product:Product;onToggle:(id:string)=>void;onUpdate:(id:string,patch:Pick<Product,"name"|"price">)=>void;onDelete:(id:string)=>void}){const [editing,setEditing]=useState(false),[name,setName]=useState(product.name),[price,setPrice]=useState(String(product.price));return <article className={!product.active?"inactive":""}>{editing?<div className="product-inline-edit"><input aria-label="Product name" value={name} onChange={(event)=>setName(event.target.value)}/><input aria-label="Product price" type="number" min="0" step=".01" value={price} onChange={(event)=>setPrice(event.target.value)}/><button onClick={()=>setEditing(false)}>Cancel</button><button disabled={!name.trim()||!Number.isFinite(Number(price))||Number(price)<0} onClick={()=>{onUpdate(product.id,{name:name.trim(),price:Number(price)});setEditing(false);}}>Save</button></div>:<><div><strong>{product.name}</strong><small>₱{product.price.toFixed(2)}</small></div><div className="product-actions"><button onClick={()=>onToggle(product.id)}>{product.active?"Available":"Hidden"}</button><button onClick={()=>setEditing(true)}>Edit</button><button className="danger" onClick={()=>onDelete(product.id)}>Delete</button></div></>}</article>;}
