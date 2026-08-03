"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Address, AppTab, DeliveryStatus, Order, Product, STATUS_LABEL as statusLabel, VALID_BLOCKS, addressLabel, makeId } from "./domain";
import { RoadMask, createRoadMask, roadPath, routeDistance as roadOrStraightDistance } from "./routing";
import { useLocalAppData } from "./use-local-app-data";
import { AddressDetails, OrderDetails } from "./order-details";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function Home() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapViewportRef = useRef<HTMLDivElement>(null);
  const mapDragRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const didDragMapRef = useRef(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const addressImportRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useLocalAppData();
  const [pendingPoint, setPendingPoint] = useState<{ x: number; y: number } | null>(null);
  const [entryMode, setEntryMode] = useState<"order" | "owner">("order");
  const [phase, setPhase] = useState<1 | 2>(1);
  const [block, setBlock] = useState(3);
  const [lot, setLot] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [items, setItems] = useState("");
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
      let bestDist = roadOrStraightDistance(current, remaining[0], roadMask);
      for (let index = 1; index < remaining.length; index += 1) {
        const d = roadOrStraightDistance(current, remaining[index], roadMask);
        if (d < bestDist) { bestDist = d; bestIndex = index; }
      }
      current = remaining.splice(bestIndex, 1)[0];
      ordered.push(current);
    }
    return ordered;
  }, [data.addresses, data.orders, routeStart, roadMask]);
  const manuallyPlannedRoute = routeAddressIds
    .map((id) => data.addresses.find((address) => address.id === id))
    .filter((address): address is Address => Boolean(address))
    .filter((address) => data.orders.some((order) => order.addressId === address.id && order.status === "out-for-delivery"));
  const routeAddresses = routeVisible ? (manuallyPlannedRoute.length ? manuallyPlannedRoute : suggestedRoute) : [];
  const routeKey = `${routeStart?.id ?? ""}:${routeAddresses.map((address) => address.id).join(",")}`;

  const routePaths = useMemo(() => {
    if (!roadMask || !routeStart || !routeAddresses.length) return [];
    let current = routeStart;
    return routeAddresses.map((address) => {
      const path = roadPath(current, address, roadMask);
      current = address;
      return path;
    }).filter((path) => path.length > 1);
  // routeKey is the stable semantic dependency for the selected route.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roadMask, routeKey]);

  function resetForm() {
    setPendingPoint(null);
    setLot("");
    setCustomerName("");
    setPhone("");
    setItems("");
    setStatus("preparing");
    setNotes("");
    setSelectedProductId("");
    setProductQuantity("1");
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
    if (didDragMapRef.current) return;
    if ((event.target as HTMLElement).closest("button")) return;
    if (!mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    setPendingPoint({
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    });
    setSelectedOrderId(null);
    setSelectedAddressId(null);
  }

  function startMapDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") return;
    if ((event.target as HTMLElement).closest("button")) return;
    const viewport = event.currentTarget;
    mapDragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop, moved: false };
    viewport.setPointerCapture(event.pointerId);
  }

  function moveMapDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") return;
    const drag = mapDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) > 5) { drag.moved = true; didDragMapRef.current = true; }
    if (drag.moved) {
      event.preventDefault();
      event.currentTarget.scrollLeft = drag.left - dx;
      event.currentTarget.scrollTop = drag.top - dy;
    }
  }

  function endMapDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") return;
    const drag = mapDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    mapDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    window.setTimeout(() => { didDragMapRef.current = false; }, 0);
  }

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

    if (!customerName.trim() || !items.trim()) return;
    const newOrder: Order = {
      id: makeId("order"),
      addressId: address.id,
      customerName: customerName.trim(),
      phone: phone.trim(),
      items: items.trim(),
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
        orders: current.orders.map((order) => order.id === orderId ? { ...order, status: nextStatus } : order),
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
    viewport.scrollTo({ left: Math.max(0, owner.x * surface.clientWidth - viewport.clientWidth / 2), top: Math.max(0, owner.y * surface.clientHeight - viewport.clientHeight / 2), behavior: "smooth" });
  }

  function prepareMap(image: HTMLImageElement) {
    setRoadMask(createRoadMask(image));
    if (window.innerWidth <= 720 && mapViewportRef.current) {
      const viewport = mapViewportRef.current;
      const imageHeightAtWidth = viewport.clientWidth * image.naturalHeight / image.naturalWidth;
      const coverZoom = Math.max(1, viewport.clientHeight / imageHeightAtWidth);
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
          {activeTab === "today" && <div className="today-intro"><p className="eyebrow">Today</p><h2>Ready to deliver something sweet?</h2><div className="stats-grid"><article><span>Preparing</span><strong>{preparingCount}</strong></article><article><span>Ready</span><strong>{readyCount}</strong></article><article><span>Delivered</span><strong>{deliveredCount}</strong></article></div></div>}
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
              return <button key={order.id} className={`order-card ${selectedOrderId === order.id ? "selected" : ""}`} onClick={() => { setSelectedOrderId(order.id); setSelectedAddressId(order.addressId); }}>
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
            <div className="map-controls"><button onClick={() => setZoom((value) => Math.max(minimumZoom, value - .25))}>−</button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom((value) => Math.min(5, value + .25))}>+</button><button onClick={() => setZoom(minimumZoom)}>Reset</button></div>
          </div>
          <button className="layers-button" onClick={() => setShowLayers((value) => !value)}>Layers</button>
          {showLayers && <div className="layers-popover"><strong>Map layers</strong><label><input type="checkbox" checked={routeVisible} onChange={(event) => setRouteVisible(event.target.checked)} /> Delivery route</label><label><input type="checkbox" checked={showAllAddresses} onChange={(event) => setShowAllAddresses(event.target.checked)} /> All saved addresses</label></div>}
          <div ref={mapViewportRef} className="map-viewport" onClick={onMapClick} onPointerDown={startMapDrag} onPointerMove={moveMapDrag} onPointerUp={endMapDrag} onPointerCancel={endMapDrag}>
            <div ref={mapRef} className="map-surface" style={{ width: `${zoom * 100}%` }}>
              {/* A native image is required because routing samples its pixels through canvas. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img ref={imgRef} src={`${BASE_PATH}/subdivision-map.png`} alt="PHirst Park Homes subdivision map" draggable={false} onLoad={(event) => prepareMap(event.currentTarget)} />
              {routePaths.length > 0 && (
                <svg className="route-layer" viewBox="0 0 1 1" preserveAspectRatio="none" aria-label="Suggested delivery route">
                  {routePaths.map((path, index) => (
                    <polyline key={index} points={path.map((point) => `${point.x},${point.y}`).join(" ")} />
                  ))}
                </svg>
              )}
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
          <div className="map-action-stack"><button onClick={() => setZoom((value) => Math.min(5, value + .25))}>+</button><button onClick={() => setZoom((value) => Math.max(minimumZoom, value - .25))}>−</button><button disabled={!owner} onClick={recenterOwner}>⌂</button></div>
          <button className="map-add-button" onClick={beginOrder}>+ New order</button>
        </section>

        <aside className="entry-panel">
          {pendingPoint ? <>
            <div className="panel-title"><div><p>{entryMode === "owner" ? "Owner setup" : "New order"}</p><h2>{entryMode === "owner" ? "Save delivery home" : "Save customer location"}</h2></div><button className="close-button" onClick={resetForm}>×</button></div>
            <div className="entry-form">
              <label>Phase<select value={phase} onChange={(event) => { const nextPhase = Number(event.target.value) as 1 | 2; setPhase(nextPhase); if (!VALID_BLOCKS[nextPhase].includes(block)) setBlock(VALID_BLOCKS[nextPhase][0]); }}><option value={1}>Phase 1</option><option value={2}>Phase 2</option></select></label>
              <label>Block<select value={block} onChange={(event) => setBlock(Number(event.target.value))}>{VALID_BLOCKS[phase].map((value) => <option key={value} value={value}>Block {value}</option>)}</select></label>
              <label className="full">Lot<input inputMode="numeric" value={lot} onChange={(event) => setLot(event.target.value.replace(/\D/g, ""))} placeholder="Lot number" autoFocus /></label>
              {entryMode === "order" && <>
                <label className="full">Customer name<input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Customer name" /></label>
                <label>Contact<input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Optional" /></label>
                <label>Status<select value={status} onChange={(event) => setStatus(event.target.value as DeliveryStatus)}>{(["preparing", "ready", "out-for-delivery", "delivered", "cancelled"] as const).map((value) => <option key={value} value={value}>{statusLabel[value]}</option>)}</select></label>
                {products.some((product) => product.active) && <div className="product-picker full"><label>Product<select value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)}><option value="">Choose a product</option>{products.filter((product) => product.active).map((product) => <option key={product.id} value={product.id}>{product.name} — ₱{product.price.toFixed(2)}</option>)}</select></label><label className="quantity-field">Qty<input type="number" inputMode="numeric" min="1" step="1" value={productQuantity} onChange={(event) => setProductQuantity(event.target.value.replace(/\D/g, ""))} /></label><button type="button" disabled={!selectedProductId || Number(productQuantity) < 1} onClick={appendSelectedProduct}>Add</button></div>}
                {items && <div className="selected-items full"><div><span>Selected products</span><strong>{items}</strong></div><button type="button" onClick={() => setItems("")}>Clear</button></div>}
                <label className="full">Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Landmark, payment, or special note" /></label>
              </>}
              <button className="primary-button full" disabled={!lot || (entryMode === "order" && (!customerName || !items))} onClick={saveEntry}>{entryMode === "owner" ? "Save owner home" : "Add order and pin"}</button>
            </div>
          </> : selectedOrder ? <OrderDetails order={selectedOrder} address={data.addresses.find((item) => item.id === selectedOrder.addressId)} routeStartAddressId={data.routeStartAddressId} showRouteStartPrompt={pendingRouteStartOrderId === selectedOrder.id} onStatus={updateStatus} onRouteStart={updateRouteStart} onClose={() => { setPendingRouteStartOrderId(null); setSelectedOrderId(null); setSelectedAddressId(null); }} /> : selectedAddress && !selectedAddress.isOwner ? <AddressDetails address={selectedAddress} orders={data.orders.filter((order) => order.addressId === selectedAddress.id)} routeStartAddressId={data.routeStartAddressId} pendingRouteStartOrderId={pendingRouteStartOrderId} onStatus={updateStatus} onRouteStart={updateRouteStart} onAdd={() => beginOrderForAddress(selectedAddress)} onClose={() => { setPendingRouteStartOrderId(null); setSelectedAddressId(null); }} /> : <div className="empty-entry"><div className="tap-icon">⌖</div><h2>{owner ? "Tap a customer lot" : "Set your home first"}</h2><p>{owner ? "A form will open with the exact pixel you tapped." : "Save your delivery start point before adding orders."}</p><button className="primary-button" onClick={owner ? beginOrder : beginOwnerSetup}>{owner ? "Add order" : "Set owner home"}</button></div>}
        </aside>
        {activeTab === "addresses" && <section className="settings-overlay address-book"><div className="address-book-title"><div><p className="eyebrow">Reusable locations</p><h2>Addresses</h2></div><button className="primary-button" onClick={beginOrder}>+ Register on map</button></div><div className="address-transfer"><div><strong>Move saved addresses</strong><small>Export from localhost, then import the same file on GitHub Pages.</small></div><div><button onClick={exportAddresses} disabled={!data.addresses.length}>Export</button><button onClick={() => addressImportRef.current?.click()}>Import</button><input ref={addressImportRef} type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importAddresses(file); }} /></div>{addressTransferMessage && <p>{addressTransferMessage}</p>}</div>{owner && <button className="owner-row" onClick={beginOwnerSetup}><span>⌂</span><div><strong>Owner home</strong><small>{addressLabel(owner)}</small></div><b>›</b></button>}{data.addresses.filter((address) => !address.isOwner).map((address) => <div className="address-book-row" key={address.id}><button className="address-main" onClick={() => { setSelectedAddressId(address.id); setSelectedOrderId(null); setActiveTab("map"); }}><span>⌖</span><div><strong>{addressLabel(address)}</strong><small>{data.orders.filter((order) => order.addressId === address.id).length} order(s)</small></div></button><button className="address-add" onClick={() => beginOrderForAddress(address)}>+ Order</button></div>)}{!data.addresses.some((address) => !address.isOwner) && <div className="empty-list">No customer addresses yet. Import your localhost addresses above or register a new one on the map.</div>}</section>}
        {activeTab === "products" && <section className="settings-overlay product-manager"><div className="address-book-title"><div><p className="eyebrow">Menu catalog</p><h2>Products</h2></div></div><div className="product-form"><label>Product name<input value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="e.g. Mango Graham Tub" /></label><label>Price<input type="number" min="0" step="0.01" value={productPrice} onChange={(event) => setProductPrice(event.target.value)} placeholder="0.00" /></label><button className="primary-button" disabled={!productName.trim() || productPrice === ""} onClick={addProduct}>Add product</button></div><div className="product-list">{products.map((product) => <article key={product.id} className={!product.active ? "inactive" : ""}><div><strong>{product.name}</strong><small>₱{product.price.toFixed(2)}</small></div><button onClick={() => toggleProduct(product.id)}>{product.active ? "Available" : "Hidden"}</button></article>)}{!products.length && <div className="empty-list">No products yet. Add your desserts here for faster order entry.</div>}</div></section>}
      </section>
      <nav className="bottom-nav" aria-label="Main navigation">
        {(["today", "map", "orders", "products", "addresses"] as AppTab[]).map((tab) => <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}><span>{tab === "today" ? "⌂" : tab === "map" ? "⌖" : tab === "orders" ? "▤" : tab === "products" ? "◇" : "◆"}</span>{tab[0].toUpperCase() + tab.slice(1)}</button>)}
      </nav>
    </main>
  );
}
