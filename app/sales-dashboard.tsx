"use client";

import { useMemo, useState } from "react";
import { Address, Order, addressLabel } from "./domain";
import { SalesPeriod, addressSales, productSales, salesSummary } from "./sales";

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 });

export function SalesDashboard({ orders, addresses }: { orders: Order[]; addresses: Address[] }) {
  const [period, setPeriod] = useState<SalesPeriod>("day");
  const summary = useMemo(() => salesSummary(orders, period), [orders, period]);
  const locations = useMemo(() => addressSales(orders, addresses), [orders, addresses]);
  const products = useMemo(() => productSales(orders), [orders]);
  return <details className="sales-dashboard" open>
    <summary><span><small>Recognized sales</small><strong>{money.format(summary.revenue)}</strong></span><span>View report</span></summary>
    <div className="sales-periods">{(["day", "week", "month"] as SalesPeriod[]).map((value) => <button key={value} className={period === value ? "active" : ""} onClick={() => setPeriod(value)}>{value === "day" ? "Today" : value[0].toUpperCase() + value.slice(1)}</button>)}</div>
    <div className="sales-metrics"><article><span>Delivered</span><strong>{summary.delivered.length}</strong></article><article><span>Expected</span><strong>{money.format(summary.expected)}</strong></article><article><span>Unpaid</span><strong>{money.format(summary.unpaid)}</strong></article></div>
    <section><h3>Sales by address</h3>{locations.map((row) => <div className="sales-row" key={row.address.id}><span>{addressLabel(row.address)}<small>{row.orders} order{row.orders === 1 ? "" : "s"} · avg {money.format(row.average)}</small></span><strong>{money.format(row.revenue)}</strong></div>)}{!locations.length && <p>No delivered sales yet.</p>}</section>
    <section><h3>Best-selling products</h3>{products.map((product) => <div className="sales-row" key={product.name}><span>{product.name}<small>{product.quantity} sold</small></span><strong>{money.format(product.revenue)}</strong></div>)}{!products.length && <p>No product sales yet.</p>}</section>
  </details>;
}
