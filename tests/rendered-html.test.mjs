import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("server renders the Sweet Route PWA shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Sweet Route<\/title>/i);
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /maximum-scale=1, user-scalable=no/);
  assert.match(html, /PHirst Park Homes subdivision map/);
  assert.match(html, /aria-label="Main navigation"/);
  assert.match(html, /Set your home first/);
});

test("keeps routing, sales recognition, and road backups wired", async () => {
  const [page, routing, sales, storage, orderDetails] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/road-network.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/sales.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/use-local-app-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/order-details.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(routing, /nearestSegment/);
  assert.match(routing, /addProjection/);
  assert.match(routing, /connectRoadPoint/);
  assert.match(page, /Road draft/);
  assert.match(page, /importRoadBackup/);
  assert.match(page, /roadNetwork\}/);
  assert.match(page, /deliveredAt:/);
  assert.match(storage, /deliveredAt:/);
  assert.match(sales, /deliveredInPeriod/);
  assert.match(sales, /addressSales/);
  assert.match(orderDetails, /order-line-editor/);
  assert.match(orderDetails, /lineItems:lines/);
});
