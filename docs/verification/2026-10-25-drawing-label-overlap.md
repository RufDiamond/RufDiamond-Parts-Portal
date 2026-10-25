# Drawing label overlap verification, 25 October 2026

## Problem and change

The public Bumper and Hitch Receiver page placed Ref. 3 and Ref. 4 badges about 16 pixels apart horizontally and 7 pixels apart vertically, while each badge was 28 pixels square. The existing collision layout ran only for selected parts, so initial labels overlapped.

The renderer now spaces every label independently of selection. Displaced labels have leaders to unchanged source anchors. Dense plates use deterministic grid placement when preserving anchors fragments the available space. A minimum drawing size reserves capacity for every label; crowded mobile plates scroll inside the viewer. Desktop spacing is 36 pixels, coarse-pointer spacing is 48 pixels to accommodate the existing 44-pixel touch targets. The minimum size scales with zoom.

No catalogue identities, source geometry, review approvals, or source files were changed.

## Verification

- Reproduced the original public collision and captured the original page.
- Added a regression using the actual Wheel 5.1 overlay data. It failed before the dense-layout correction and passed afterwards.
- Frontend suite: 414 tests passed across 39 files.
- Production build: passed.
- Focused ESLint and git diff whitespace check: passed.
- Independent review found a zoom-floor issue; corrected it and added a first-step zoom growth assertion across the catalogue.
- Catalogue/browser-shell sweep: all 135 catalogue viewport cases and all 3 quote/shell cases passed. All 44 legacy diagram cases have also passed, with the 14 affected native/synthetic cases rerun after correcting test assumptions (14/14). This validates 182 distinct browser checks across the catalogue sweep and targeted reruns; the first combined run was 172/182 before the stale interaction expectations were corrected. The suite covers all 45 catalogue figures at desktop 1440x1000, tablet 1024x768 with touch, and mobile 390x844 with touch; checks initial/selected/zoomed/fullscreen collisions, actual mouse clicks or taps, row selection, page errors and page overflow. Legacy interaction tests additionally cover native wheel, panning, resizing, physical region clicks, excluded holes, keyboard controls and fullscreen. Quote/shell tests check customer routes and unauthenticated staff price protection.

The browser sweep explicitly accepts two existing catalogue source gaps: Cabin 6.15 has no drawing and Cabin 6.13 has no positioned callouts. Passing UI checks do not approve pending source mappings.

## Deployment

Published commit `73024fb932fb25c06c33bee97121aa2b65f597c1` to `feature/frontend-setup`. The public HTML now contains the new drawing-size property, and a fresh Chrome load visibly separates Bumper Ref. 3/4. All 9 live checks passed: Bumper 2.1 and Wheel 5.1 at desktop/tablet/mobile (actual clicks/taps, zoom, fullscreen), customer quote/checkout shell, sign-in links, and unauthenticated admin price protection.

Live JSON evidence: `output/overlap-live/results.json`. Live screenshots: `output/verification/2026-10-25-overlap/live-{desktop,tablet,mobile}-bumper-fullscreen.png`. Local full-run evidence: `output/overlap-e2e/results.json`; corrected interaction rerun: `output/overlap-diagram-final-2/results.json`.

## Separate production gaps

This change does not configure a live API or mail delivery. Browser fixture commerce checks do not establish server persistence or real customer email delivery.

## Broader API test result on the unchanged deployment branch

The separate API suite completed with 287 passing and 6 failing tests (293 total). Four failures are obsolete migration-count expectations (12 versus the current 14); one is the existing `commerce_order.discount_rate` SQL/Drizzle precision mismatch (`numeric(8,4)` versus `numeric(7,6)`); one is a one-second signed-upload expiry test receiving HTTP 403 before its expected immediate PUT. No API files are changed by the drawing repair. Migration-count/precision corrections were previously saved in the separate `codex/commerce-mail-staging` branch (`c5cc348`), which remains outside this deployment. The signed-upload test passed on a standalone rerun (all 14 storage tests passed), indicating a timing-sensitive failure. The five schema failures still prevent claiming the entire application/backend suite is green.

## Original catalogue reconciliation

Signed into the original Intelli Catalogue after the user authorized the CAPTCHA step. Captured all 45 figure tables through the UI, with complete displayed row counts totaling 635 rows. Compared all 635 portal rows one-to-one by figure identity, part number and source reference where necessary. No unresolved row identities remain. 631 rows match every compared detail field; four rows differ (description, price, two quantity literals). Serial-range metadata and duplicated source figure numbering also differ. Source table-only references account for 60 presentation differences where the prototype has no imported drawing callout.

The full report and source evidence remain local under ignored `output/source-catalogue-verification/report.md`, `comparison.json`, `source-rows.json`, and `source-price-46-00006.png`. Private source data and login credentials are not committed. No catalogue data, mapping approval, or physical placement is changed by this comparison. This checks table details and identity, not approval of every geometric hotspot.

## Follow-up: one selected label per part number

The user requested one highlighted label per unique selected part number while retaining every component highlight and original drawing reference. Selection now has a wrapping badge strip outside the artwork. Reference buttons retain their identity, keyboard/click activation and shared pressed state without repeated selection-colored boxes. Every mapped numeric/legacy component still receives the existing selected fill. Badge activation deselects the original source part identities. Selected table rows with no positioned marker also receive a removable badge labeled `No mapped highlight`; geometry is never invented.

Final follow-up verification: all 419 frontend tests across 39 files passed with original timeouts; all 182 browser tests passed in one clean final run (5.6 minutes, three independent workers). Production build, focused ESLint, TypeScript and whitespace checks passed. The final browser suite includes all 45 figures at desktop/tablet/mobile, selected-badge uniqueness and visible-artwork exclusion, badge/child/ancestor clipping, normal/fullscreen badge deselection, unmapped rows, original reference activation, and physical-component/zoom/pan/resize/editor/shell/privacy checks.

The stronger mobile regression exposed a genuine ancestor clipping bug: `.plate > figure` forced a 360-pixel minimum on narrower panels. Removing that outer minimum lets the strip wrap inside the panel while the internal drawing stage preserves its density floor and scrolls. The regression failed before the CSS correction and passed afterwards. The image-overlap helper also now checks the visible image clipped by its scroll viewport, rather than the offscreen portion of a zoomed image.

Final full-browser evidence: `output/single-selection-final/results.json`. Focused 12-case final matrix: `output/selected-badge-metadata-final/results.json`. Published the selection refinement as commit `e7f1209` on `feature/frontend-setup`. All 15 live checks passed (32.8 seconds): Bumper 2.1, Wheel 5.1, Cabin 6.13 and Cabin 6.15 at desktop/tablet/mobile, plus quote/checkout shell, sign-in links and staff price protection. A separate fresh Chrome interaction selected Wheel Ref. 4 and verified exactly one part-number badge, 16 selected component paths and 16 original pressed reference buttons.

Live evidence: `output/single-selection-live/results.json` and `output/verification/2026-10-25-overlap/live-one-label-sixteen-components.png`. The source catalogue remained unchanged; its full local reconciliation report remains in ignored output.
