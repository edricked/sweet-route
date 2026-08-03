import { Address, DELIVERY_STATUSES, DeliveryStatus, Order, STATUS_LABEL, addressLabel } from "./domain";

type StatusHandler = (id: string, status: DeliveryStatus) => void;
type RouteStartHandler = (addressId: string, enabled: boolean) => void;

export function OrderDetails({ order, address, routeStartAddressId, showRouteStartPrompt, onStatus, onRouteStart, onClose }: { order: Order; address?: Address; routeStartAddressId?: string; showRouteStartPrompt: boolean; onStatus: StatusHandler; onRouteStart: RouteStartHandler; onClose: () => void }) {
  return <>
    <div className="panel-title"><div><p>Order details</p><h2>{order.customerName}</h2></div><div className="sheet-actions"><span className={`status-pill ${order.status}`}>{STATUS_LABEL[order.status]}</span><button className="sheet-close" onClick={onClose} aria-label="Close order details">×</button></div></div>
    <div className="details"><p><strong>Address</strong>{address ? addressLabel(address) : "Address missing"}</p><p><strong>Order</strong>{order.items}</p>{order.phone && <p><strong>Contact</strong>{order.phone}</p>}{order.notes && <p><strong>Notes</strong>{order.notes}</p>}</div>
    <StatusSelect order={order} address={address} routeStartAddressId={routeStartAddressId} showRouteStartPrompt={showRouteStartPrompt} onStatus={onStatus} onRouteStart={onRouteStart} className="status-control" />
  </>;
}

export function AddressDetails({ address, orders, routeStartAddressId, pendingRouteStartOrderId, onStatus, onRouteStart, onAdd, onClose }: { address: Address; orders: Order[]; routeStartAddressId?: string; pendingRouteStartOrderId: string | null; onStatus: StatusHandler; onRouteStart: RouteStartHandler; onAdd: () => void; onClose: () => void }) {
  const activeOrders = orders.filter((order) => order.status !== "delivered" || order.id === pendingRouteStartOrderId);
  return <div className="address-details">
    <div className="panel-title"><div><p>Saved address</p><h2>{addressLabel(address)}</h2></div><div className="sheet-actions"><span className="address-order-count">{activeOrders.length} active</span><button className="sheet-close" onClick={onClose} aria-label="Close address details">×</button></div></div>
    <div className="address-orders">{activeOrders.map(order=><article key={order.id}><div className="address-order-heading"><div><strong>{order.customerName}</strong><small>{order.items}</small></div><span className={`status-pill ${order.status}`}>{STATUS_LABEL[order.status]}</span></div>{order.phone&&<small className="address-order-meta">Contact: {order.phone}</small>}{order.notes&&<small className="address-order-meta">{order.notes}</small>}<StatusSelect order={order} address={address} routeStartAddressId={routeStartAddressId} showRouteStartPrompt={order.id === pendingRouteStartOrderId} onStatus={onStatus} onRouteStart={onRouteStart}/></article>)}{!activeOrders.length&&<p className="no-address-orders">No active orders at this address.</p>}</div>
    <button className="primary-button" onClick={onAdd}>+ Add another order</button>
  </div>;
}

function StatusSelect({ order, address, routeStartAddressId, showRouteStartPrompt, onStatus, onRouteStart, className }: { order: Order; address?: Address; routeStartAddressId?: string; showRouteStartPrompt: boolean; onStatus: StatusHandler; onRouteStart: RouteStartHandler; className?: string }) {
  return <div className={className}>
    <label>Update status<select value={order.status} onChange={event=>onStatus(order.id, event.target.value as DeliveryStatus)}>{DELIVERY_STATUSES.map(value=><option key={value} value={value}>{STATUS_LABEL[value]}</option>)}</select></label>
    {showRouteStartPrompt && order.status === "delivered" && address && <label className="route-start-option"><input type="checkbox" checked={routeStartAddressId === address.id} onChange={(event) => onRouteStart(address.id, event.target.checked)} /><span><strong>Continue from this location</strong><small>Use this address—not home—as the next route’s starting point.</small></span></label>}
  </div>;
}
