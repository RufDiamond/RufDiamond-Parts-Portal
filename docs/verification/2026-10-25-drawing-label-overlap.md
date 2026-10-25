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

Final full-browser evidence: `output/single-selection-final/results.json`. Focused 12-case final matrix: `output/selected-badge-metadata-final/results.json`. Public verification follows deployment of this change.

## Correction: retain the in-drawing selection labels

The user rejected the added strip above the artwork. It has been removed from
the normal and fullscreen viewers, along with its row metadata and styling.
One existing reference label per selected catalogue part number now receives
the selected color in the drawing. Every original reference remains present,
clickable and keyboard accessible, with the same shared pressed state. All
mapped component fills retain their existing selection behavior. The label
spacing repair and narrow-panel sizing remain in place; no source geometry,
catalogue records, API code, migration or mail configuration is changed.

Two focused regressions first failed because both reference labels were red.
They now pass, including shared part identities, different identities sharing
a part number, multiple selections, hover, fullscreen and deselection from an
unhighlighted reference. The quantity audit also checks exactly one highlighted
reference for every mapped multi-quantity selection across its 40 figures.

Verification: 416 frontend tests passed in 39 files; production build, changed
TypeScript/TSX lint with zero warnings and whitespace checks passed. Thirteen
local browser checks passed, including Filters 1.1, Bumper 2.1 and Wheel 5.1 at
desktop/tablet/mobile, real component activation, zoom, fullscreen and the
customer/admin shell. Browser assertions check actual reference background
colors and absence of the added strip. Local evidence is in
`output/inline-reference-local/results.json`. Hosted checks follow the push.

For current migration/API status, see
[the separate migration release](2026-10-25-discount-migration-deployment.md).

## Final clarification: one visible reference at all times

The user confirmed that each part number should have one visible reference
before, during and after selection. Repeated overlay labels and their
display-only leaders are omitted in every state. The single reference stays
inside the drawing. Every mapped numeric region and legacy mask remains
present, selectable and linked to the existing part selection. Source artwork,
coordinates, part associations and approval state remain unchanged.

Layout and minimum canvas width reserve space only for the displayed labels.
This removes the crowding and unused width caused by quantity-expanded labels.
Known part numbers are resolved across numeric, legacy and marker-only
occurrences sharing a part identity. Focus is retained on the visible reference
if selection replaces its source identity. Normal and fullscreen views share
the same behavior. No additional banner is introduced.

The default-view regression first failed with three references where two were
expected (one per distinct part number). It now passes and checks selection
through another physical component. Mixed-format grouping also has a regression:
numeric, legacy and marker-only occurrences of the same part share one label,
while both mapped component regions stay present. The quantity audit checks one
reference per mapped part before and after selection across 40 figures, with
unchanged component counts. The final frontend suite passes 419 tests in 39
files. Production build, changed-file lint with zero warnings and whitespace
checks pass. Earlier selected-only test runs were interrupted when this broader
default-view requirement was confirmed; the final browser run uses the updated
requirement throughout.

Final browser coverage includes 182 distinct checks: 177 passed in the full
run, and the remaining five passed after the fullscreen test moved the pointer
away from labels before counting selected colors. Those five initially counted
a transient hover on another part as a second selection; no production change
was needed. All 45 figures were checked at desktop, tablet and mobile sizes,
alongside 44 native interaction cases and three shell/privacy cases. Evidence:
`output/one-reference-default-verified/results.json` and
`output/one-reference-default-fullscreen-final/results.json`. Optional browser
tracing was disabled after earlier trace writes exhausted available disk space.

Local visual checks confirm references 1–7 appear once each on Bumper 2.1 and
Wheel 5.1 before selection. Selecting reference 4 leaves one label and highlights
both mapped Bumper components or all 16 mapped Wheel screws. Deselecting retains
one reference. Screenshots and counts are retained in
`output/verification/2026-10-25-one-label-default/`. Independent code review found
no actionable issues. Public deployment verification follows the push.

## Superseding clarification: keep every occurrence reference visible

The user subsequently clarified: “Every number visible normally; one highlighted
when selected.” This supersedes the preceding one-visible-reference rule.
Every occurrence keeps its original numbered label before, during and after
selection. Only one label per selected part number receives the active color;
all associated mapped components highlight together. The other occurrence
labels remain visible, clickable and keyboard accessible. There is no banner.

Rendering, display leaders, collision layout and minimum canvas sizing again
use the complete marker list. The temporary focus transfer for replacing a
representative label is removed because each original label now retains its
keyed DOM node. Shared part-number resolution across numeric, legacy and
marker-only occurrences remains. Artwork, source geometry, catalogue data,
component identities, API and mail configuration are unchanged.

The regression first failed with two references instead of three. The corrected
viewer passes all 419 frontend tests across 39 files, including the 268-row
quantity audit across 40 figures, mixed formats, alternate source identities,
keyboard focus, deselection and fullscreen. Production build and changed-file
lint pass. Independent read-only code review found no actionable issues.
All 182 browser checks passed in one clean run (3.5 minutes): all 45 figures at
desktop/tablet/mobile sizes, 44 native interaction checks, and three shell/privacy
checks. Every rendered reference can still be activated; label counts stay
unchanged through selection/deselection, with one selection-colored label.
Evidence: `output/restored-occurrence-references/results.json`.

Local visual checks confirm all 10 Bumper references and 58 Wheel references
remain present. Selecting 4 keeps both Bumper labels or all 16 Wheel labels,
colors one label, and highlights both Bumper components or all 16 Wheel screws.
Each of those 18 components was individually activated, and deselection through
an alternate label was verified. Screenshots/counts are retained in
`output/verification/2026-10-25-restored-occurrence-references/`. The standalone
capture waits for the existing color transition before counting red labels.
The frontend harness emits existing duplicate-key warnings in a shared-identity
fixture; all assertions pass. Public deployment verification follows the push.
