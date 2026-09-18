# Portal use and support handoff

## Finding and selecting parts

1. Open Fat Truck Parts, select the model and serial range, then the system and figure. Part-number search is available on the model screen.
2. Click a part's reference, its mapped shape, its row, or its checkbox. All mapped physical occurrences of that part select together.
3. Click again to deselect. Clear Selection clears the drawing and checkboxes. It does not delete parts already added to a quote request.
4. Use Show selection in drawing to bring the selected mapped locations into view. Wheel up/down over the drawing zooms around the pointer; drag enlarged artwork to pan. The parts table scrolls independently. Fullscreen uses the same selection.
5. “Needs Review” means drawing coverage needs checking. It does not establish the part is absent from the vehicle. Do not invent missing locations or substitute a different reference.

## Quote and pricing

- Add selected parts to the request, then review quantities and comments. Installed quantity shown on the figure is distinct from what a customer intends to request.
- A displayed 0.00 is not a selling price. Request a quote. Listed nonzero prices can also change; RUF confirms current manufacturer pricing.
- The customer sees one quote request document. Print prints that document; Save PDF opens the same print dialog, where the user chooses Save as PDF.
- A local fixture confirmation is not evidence of transmission. When the request service says it is disconnected, no request has been sent. Final order submission remains under review.
- The RUF cursor is provided automatically by the website. No installation is necessary.

## When something is wrong

1. Record the page URL, model/serial range, figure number, part number/reference and the steps that caused the issue. Capture the visible error and time. Do not send passwords or authentication codes.
2. Check whether the page is an unapproved marker-review screen, a local preview or the released customer portal. Never use a review overlay as an approved catalogue.
3. For mismatched selection or a missing image, reload once and recheck the exact figure. If it persists, leave the source data unchanged and route the evidence to Alpha Nova support.
4. For incorrect price/source comments, route the exact part and manufacturer evidence to Andres. A developer should not guess corrected pricing or asterisk wording.
5. For an outage, use the pilot's existing Intelli fallback if RUF has confirmed it is available. Do not replace the active release or restore a backup without the responsible operator following the recovery plan.

## Continuity handoff

The existing technical references are [deployment and testing](deployment-and-testing-guide.md), [backup and recovery](backup-and-recovery-plan.md), [catalogue source review](catalog-source-review.md), and [backend specification](backend-specification.md).

Before customer handoff, RUF/Alpha Nova still need to fill and verify this operational directory: primary support contact, named second contact, RUF repository owners and access, hosting/DNS owner, backup operator, latest successful restore drill, and pilot fallback contact. No names, accounts or completed drills are inferred here. Keep credentials in the organization's approved secret store, outside this manual.
