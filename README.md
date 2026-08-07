# Sweet Route

A local-first PWA for managing dessert orders and planning delivery routes inside PHirst Park Homes Calamba.

## Features

- Pin reusable Phase, Block, and Lot addresses on the subdivision map.
- Keep multiple orders per address with products, quantities, payment state, and delivery status.
- Plan an offline delivery route using image-based roads or a validated traced-road network.
- Track recognized sales by day, week, month, address, and product.
- Back up and restore addresses, orders, products, road drafts, or the complete app dataset.
- Install as a PWA from GitHub Pages; all business data remains local to the current browser/device.

## Local development

```powershell
npm install
npm run dev -- --port 8001
```

Verification:

```powershell
npm run lint
npm test
```

## Data safety

Browser storage is specific to each origin and device. A localhost dataset does not automatically appear on GitHub Pages. Export a **Full app** backup regularly and restore it on another device when needed. Full backups include the road draft; restored road routing is disabled until it is validated again.

## Deployment

Pushes to `main` run `.github/workflows/deploy-pages.yml` and publish the static PWA to GitHub Pages.
