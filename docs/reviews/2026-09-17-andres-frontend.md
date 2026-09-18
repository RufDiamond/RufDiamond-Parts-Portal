# Andres frontend review — September 17, 2026

Source: the user's compiled notes from Andres's September 16 review and earlier decisions. This is a frontend follow-up to the existing portal, not a rewrite of the source-review workflow in `.superpowers/sdd/2026-09-08-png-diagram-mapping/task-10b-preflight.md`.

## Implementation

| Review point | Result |
| --- | --- |
| Home fits one desktop screen | Compact, viewport-height desktop cards and rail. Verified 1280×720, 1440×900, 1920×1080. Mobile stacks vertically and retains scrolling for readable content. |
| Text/icons tighter; less gap from rail | Reduced rail, card and content spacing. |
| Larger logo; flag aligned to wordmark | Existing emblem, wordmark and flag assets laid out separately; no raster artwork regenerated. |
| Fat Truck, IronHorse, quote, technical icons | Increased their displayed scale and normalized icon boxes. |
| Biome | First choice in the UI font stack when locally installed; no licensed webfont exists in the repo or standard Mac font folders. Current fallback remains until a licensed font is supplied. Not marked complete. |
| Title larger and to the side | Left-aligned beside the brand with responsive size. |
| Yellow cursor outline | Existing RUF cursor is applied by website CSS automatically. No customer installation is needed. No guessed change to the cursor artwork. |
| Sharper centre grid | Resolution-independent CSS grid on home. |
| Vehicle images fill boxes; rounded corners | Increased image area, adjusted scale for transparent source padding, retained wide vehicle proportions, rounded panels/tiles/inputs. |
| System icon page | Existing layout retained. Only Filters icon enlarged. |
| Top notices | Persistent source/review context moved below figure workspace; runtime errors stay visible where actionable. |
| Grid behind exploded image | Removed from the shared viewer, including fullscreen. |
| Cursor-centred wheel zoom | Preserve image-relative pointer anchor; account for letterboxing and scroll boundaries. |
| Centred headers | Parts table column headings centred. |
| Diagram/list deselect, checkbox sync, Clear Selection | One part-level selection drives highlights and checkboxes. Repeated physical occurrences remain grouped. Clearing does not remove parts already added to the request. |
| Bottom selection notices | Labelled as selected part locations/drawing coverage, distinct from request quantities. Mapping gaps remain visible and do not invent locations. |
| Show selected part | Renamed to “Show selection in drawing” with an explanatory tooltip; brings selected mapped parts into view. |
| Customer quote document | Only the original left-hand RUF/factory-format document is visible to the customer, as requested; the second document is hidden. No delivery claim is made. |
| Print / Save PDF | Customer document only. Save PDF opens the browser print dialog; select Save as PDF. Multi-page tables retain their headers. |
| Price changes / $0 | Notices state current manufacturer price is confirmed on quote, and 0.00 is not a selling price. No inferred price-change detection. |
| Search entry | Model and part-number search retained; description search entry removed per August 31 decision. |

## Business decisions retained

- Andres owns price updates as manufacturer updates arrive; changes are per part, not assumed to cover the whole catalogue. Manufacturer confirmation at quote time is authoritative.
- Order submission is still under design. This change does not establish a Quote→Order contract, take payments, connect Xero, or send messages. Existing disconnected-service guards remain.
- Asterisks and other part comments retain their source wording. Andres must approve explanatory wording; no meanings were inferred.
- Phase 1 focuses on FT3/Fat Truck. Agilis remains conditional; IronHorse and Xero are later phases. Do not present unavailable catalogues as usable.
- Manual missing-part entry, multi-model cart, order status, technical info and outstanding home/PDF links require their existing product/source decisions. The review does not make these complete.
- GoDaddy subdomain, OVH backups, dedicated parts mailbox, CAD/USD/SEK price history, brand-collision handling and keeping Intelli live during pilot are retained requirements. This frontend change is not deployment or operational proof of them.
- August 12's wait-for-PPT note is historical; the September 4 PPT and September 16 review now inform this frontend pass.
- Meeting windows and positive comments are context, not verification of any delivered feature.

## Verification

See the final run evidence below and `docs/portal-operations-guide.md` for customer/support instructions. Tests use local fixture data; no quote was sent and no production deployment was made.

- Full frontend suite: 32 files / 363 tests passed. Latest targeted rerun after document pagination and selection copy: 20 tests passed.
- Regressions first reproduced the separate-checkbox-state bug and a 137px wheel anchor drift before the fixes.
- Native Chrome: Windows and Filters fit/zoom/fullscreen/resize, cursor anchor regression, and checkbox → marker → deselect → clear sequence passed. No page errors in the focused selection flow.
- Desktop home dimensions matched viewport dimensions at 1280×720, 1440×900 and 1920×1080. At 390×844 the page remains 390px wide and scrolls vertically.
- Customer PDF: one short request produced one page; 80 lines produced four pages with all 80 part numbers retained. Portal controls are excluded. Sample data is explicitly marked QA-ONLY-NOT-SENT.
- Production Next.js build passed. Typecheck and ESLint on changed frontend files passed; git diff whitespace check passed.
- Evidence screenshots and sample PDFs: `output/andres-review-20260917/` (local, not committed).
- Checkout branch: `codex/latest-frontend-integration`; changes remain local, uncommitted, and undeployed. The existing Task 10b preflight and source geometry were not edited.

- Final review found and reproduced a stale 198px wheel offset after fullscreen resize. The viewer now clamps the offset on container resize; a dedicated native regression passes alongside the Windows, Filters and cursor-anchor checks (four browser tests total).
- Final quote check retains the exact original left-hand document format. Its one-document/Print/Save PDF regression passes. Production build and changed-file lint were rerun successfully after final corrections.
