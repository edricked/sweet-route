import { Address, Order } from "./domain";

export type SalesPeriod = "day" | "week" | "month";

export function recognizedAt(order: Order) {
  return order.deliveredAt ?? (order.status === "delivered" ? order.createdAt : null);
}

export function orderRevenue(order: Order) {
  return Math.max(0, Number(order.total) || 0);
}

function periodStart(period: SalesPeriod, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "week") {
    const mondayOffset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - mondayOffset);
  } else if (period === "month") start.setDate(1);
  return start;
}

export function deliveredInPeriod(orders: Order[], period: SalesPeriod, now = new Date()) {
  const start = periodStart(period, now);
  const end = new Date(start);
  if (period === "day") end.setDate(end.getDate() + 1);
  else if (period === "week") end.setDate(end.getDate() + 7);
  else end.setMonth(end.getMonth() + 1);
  return orders.filter((order) => {
    const timestamp = recognizedAt(order);
    if (!timestamp) return false;
    const delivered = new Date(timestamp);
    return delivered >= start && delivered < end;
  });
}

export function salesSummary(orders: Order[], period: SalesPeriod) {
  const delivered = deliveredInPeriod(orders, period);
  return {
    delivered,
    revenue: delivered.reduce((sum, order) => sum + orderRevenue(order), 0),
    unpaid: delivered.filter((order) => order.paymentStatus !== "paid").reduce((sum, order) => sum + orderRevenue(order), 0),
    expected: orders.filter((order) => !["delivered", "cancelled"].includes(order.status)).reduce((sum, order) => sum + orderRevenue(order), 0),
  };
}

export function addressSales(orders: Order[], addresses: Address[]) {
  return addresses.filter((address) => !address.isOwner).map((address) => {
    const delivered = orders.filter((order) => order.addressId === address.id && recognizedAt(order));
    const revenue = delivered.reduce((sum, order) => sum + orderRevenue(order), 0);
    return { address, orders: delivered.length, revenue, average: delivered.length ? revenue / delivered.length : 0 };
  }).filter((row) => row.orders > 0).sort((a, b) => b.revenue - a.revenue);
}

export function productSales(orders: Order[]) {
  const totals = new Map<string, { name: string; quantity: number; revenue: number }>();
  orders.filter((order) => recognizedAt(order)).forEach((order) => order.lineItems?.forEach((line) => {
    const key = line.productId ?? line.name;
    const current = totals.get(key) ?? { name: line.name, quantity: 0, revenue: 0 };
    current.quantity += line.quantity;
    current.revenue += line.quantity * line.unitPrice;
    totals.set(key, current);
  }));
  return [...totals.values()].sort((a, b) => b.revenue - a.revenue);
}
