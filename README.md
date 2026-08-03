# PHirst House Mapper

A local-first map editor for tracing individual PHirst Park Homes Calamba lots.

## Current workflow

1. Zoom into a house or lot.
2. Click every corner in order, following the printed boundary and any angled edges.
3. Enter Phase, Block, and Lot.
4. Save the polygon.
5. Click any saved polygon to edit its address or delete it.
6. Export JSON or CSV regularly.

The browser stores progress in local storage on the current device. JSON export
is the full-fidelity backup and includes every polygon vertex. CSV export is
provided for spreadsheet review.

## Address rules

- Phase 1 has Blocks 3–33.
- Phase 2 has Blocks 2–24.
- The large A/B/C section letters are intentionally ignored.
- IDs use `P1-B007-L060`.

## Development

```text
npm install
npm run dev
```

Build validation:

```text
npm run build
```

## GitHub Pages

Pushes to `main` run `.github/workflows/deploy-pages.yml`. The workflow creates
a static export, detects the repository subpath, uploads the Pages artifact,
and deploys it through GitHub Pages.

Enable **Settings → Pages → Source → GitHub Actions** once for a new repository.
Browser data is local to each site origin, so localhost records must be exported
and restored after the first deployment.
