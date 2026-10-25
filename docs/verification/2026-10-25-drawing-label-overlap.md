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

The user supplied access to the original Intelli Catalogue on 25 October. Login is prepared without remembering credentials, awaiting the user at the CAPTCHA step. The portal comparison baseline contains 45 figure pages, 635 figure-part rows and 536 unique part records under ignored `output/source-catalogue-verification/`. No original-catalogue details have yet been verified in this pass. Source comparison and drawing/source approval remain separate from collision-free rendering.
