export type DeliveryStatus = "preparing" | "ready" | "out-for-delivery" | "delivered" | "cancelled";
export type AppTab = "today" | "map" | "orders" | "products" | "addresses";
export type Point = { x: number; y: number };

export type Address = {
  id: string; phase: 1 | 2; block: number; lot: number;
  x: number; y: number; isOwner: boolean; createdAt: string;
  customerName?: string; phone?: string;
};

export type Order = {
  id: string; addressId: string; customerName: string; phone: string;
  items: string; status: DeliveryStatus; notes: string; createdAt: string;
  lineItems?: OrderLine[]; total?: number; paymentStatus?: "unpaid" | "paid";
};

export type Product = { id: string; name: string; price: number; active: boolean; createdAt: string };
export type OrderLine = { productId?: string; name: string; quantity: number; unitPrice: number };
export type AppData = {
  addresses: Address[];
  orders: Order[];
  products: Product[];
  routeStartAddressId?: string;
};

export const EMPTY_APP_DATA: AppData = { addresses: [], orders: [], products: [] };
export const VALID_BLOCKS = {
  1: Array.from({ length: 31 }, (_, index) => index + 3),
  2: Array.from({ length: 23 }, (_, index) => index + 2),
};

export const STATUS_LABEL: Record<DeliveryStatus, string> = {
  preparing: "Preparing", ready: "Ready for delivery",
  "out-for-delivery": "Out for delivery", delivered: "Delivered", cancelled: "Cancelled",
};

export const DELIVERY_STATUSES: DeliveryStatus[] = ["preparing", "ready", "out-for-delivery", "delivered", "cancelled"];

export function makeId(prefix: string) { return `${prefix}-${crypto.randomUUID()}`; }
export function addressLabel(address: Pick<Address, "phase" | "block" | "lot">) {
  return `Phase ${address.phase} · Block ${address.block} · Lot ${address.lot}`;
}
