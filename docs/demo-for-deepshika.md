# Customer demo — Andres review pass (17 Sep 2026)

**Live URL for Andres / customer:** https://ruf-diamond-parts-portal.vercel.app

Use that link only. Branch preview links under `*.vercel.app` may ask for a Vercel login and will not work for the customer.

## What this version includes

- Home layout tightened for one desktop screen; larger logo / icons; model photos fill their tiles
- Diagram ↔ parts-list selection stays in sync; Clear Selection clears both
- Wheel zoom centres on the cursor; no grid behind the exploded drawing
- Notices sit under the figure; “Show selection in drawing” brings mapped parts into view
- Customer quote document only (left-hand RUF format) with Print and Save PDF
- $0 prices are not treated as selling prices; quote path remains

## Suggested walkthrough (≈10 minutes)

1. Open Home — one-screen desktop layout, Fat Truck / IronHorse / quote icons.
2. Fat Truck → FT3 Wagon → a systems tile → an exploded figure (Windows or Filters works well).
3. Click a callout on the drawing, then the matching row/checkbox — both stay selected. Click again to deselect; use Clear Selection.
4. Wheel-zoom over the drawing (cursor stays under the pointer); fullscreen if useful.
5. Add a few parts → Request a quote → confirm → show Print / Save PDF on the customer document.
6. Point out a $0 row if one appears: that is quote-only, not a selling price.

## Say clearly to the customer

- This is the current portal preview with Andres’s 16 Sep frontend notes applied.
- Prices still change; RUF confirms manufacturer price when quoting.
- Order-submit workflow is still being redesigned — do not treat the quote screen as final order placement.
- Licensed Biome font is not installed on the site yet (falls back until RUF supplies the file).
- Asterisk / part-comment wording still needs Andres’s approval before any change.

## Do not open during the demo

- Marker-review / unapproved overlay routes
- Internal docs under `docs/reviews/`
- Any Vercel “Preview” deployment URL that redirects to login

## If something fails

Note URL, model, figure, part number, and steps. Route pricing/comment wording to Andres; technical faults to Alpha Nova support. See [portal-operations-guide.md](portal-operations-guide.md).
