# Design update — 12 October 2026

Source: `design-reference/source/Updated screens on parts portal.pdf` (82 pages,
exported from PowerPoint, file intact). Compared page by page against the V2
deck (`Screens New RD Parts Portal - V2 - 30-SEP-2026`, 56 pages).

Pages 1–56 are the V2 deck again: same screens, same text, with section divider
slides added (Access, Home, Search by Model, Search by Part Number, Search by
Description, Action Buttons). The new material is pages 57–81.

Toolbar icons and the header logo are again linked images that did not travel
with the file ("picture can't be displayed"), as in `clients.md` §1.5.

---

## New screens

### 1. Quote Status — Ruf Diamond admin view (p58)
Table filled in by the RUF administrator from the factory's quotation.

- Columns: Select, No., Date Request, Quote No. (`RD-00001`), Customer, User,
  Part No., Description, Qty, Response Date, Response Days, Available
  (YES / PARTIAL / NO), Est. Availability, New Part No., New Description, New
  Qty, Unit Price (CAD), Total Price (CAD), Comments, Notify Customer, Model,
  Serial Number, System, Page (figure), Assembly Name.
- Row colour by availability: green YES, yellow PARTIAL, red NO.
- A factory reply can add rows that were not requested (row 3 → an extra
  `98-00037` line).
- Toolbar: pagination, Export to Excel, Email, Print, Home.
- Rows from every customer; grouped by product line in the rail.

### 2. Quote Status — customer view (p59)
The same records filtered to the customer's own account, with fewer columns:
Select, Date Request, Quote No., Customer, User, Part No., Description, Qty,
Available, Est. Availability, New Part No., New Description, New Qty, Unit
Price, Total Price, Comments, **Add to Cart?**

- Price Validity Notice: prices valid **30 calendar days from Date Request**.
- Buttons: Add to Cart, Check Cart. Proceeding to Checkout moves the customer to
  the Order Request page.
- Records stay in Quote Status whether or not the customer orders.
- Both views sort **newest request first**.
- Stated purpose: over time, track which parts needed quotes, how often, and
  whether the customer ordered.

### 3. Add to Cart confirmation, redesigned (p61–63)
Replaces the current confirmation pop-up.

- Table: Part No., Part Name, **Confirm Qty** (editable), Unit Price (CAD),
  Subtotal (CAD); then Subtotal, **Discount**, Total.
- Prices shown **before tax** (province is unknown).
- Export to Excel and Add to Cart buttons.
- After adding: "Selected Part(s) Successfully Added To Order List." with OK.

### 4. Check Cart mini-cart (p64)
Drop-down from the Check Cart button: each line with name, part number, price ×
qty, a − / + stepper and a delete icon; "N items / N Qty. in your Cart",
Clear Cart, Subtotal, and **Checkout** / **Your Cart** buttons.

### 5. Order Request wizard (p65–77)
One page, sections that unlock left to right and top to bottom. A finished
section turns green; the current one is orange; an arrow button advances.

1. **Order type** — Regular, Urgent, or Schedule (with a date field and
   calendar). Schedule should remind the administrator and, if possible, notify
   the factory at once so parts are set aside.
2. **Order type detail** — PO No. (free text) and VIN No. (a list of the
   customer's own serial numbers plus "Other…" to type one).
3. **Shipping method** — one of Purolator Ground, Purolator Express,
   Manitoulin Transport. Applies to Regular and Urgent.
4. **Shipping address / Billing address** — First and last name, Company,
   Address, City, Province, Country, Postal Code, Email, Phone. "Shipping address
   is same as billing address" option; Update Shipping / Update Billing buttons.
5. **Special instructions** — free text.

Rules on p69: the user can go back to any section without losing what they
entered; if a change invalidates something later, keep what still applies and
tell the user what needs reviewing.

### 6. Order confirmation (p78–79)
Review page before submission: "ORDER CONFIRMATION No: 00001", billing address,
line table (Item, Part No., Part Name, Confirm Qty, Unit Price, Subtotal, then
Subtotal / Discount / Total), special instructions, shipping address, order
type, carrier, PO and VIN. Right column: **Pricing Disclaimer & Order Terms**
(1 Pricing, 2 Critical Parts Orders → parts@rufdiamond.com, 3 Tire & Rim
Assemblies, 4 Order Inspection within 24 hours, 5 Returns & Cancellations — 50%
restocking fee, 30 days, 6 Back Orders & Partial Shipments). Back and Submit.
On submit: "Your order has been submitted successfully." and the heading
becomes "ORDER No: 00001".

### 7. Order Status (p81–82)
Divider slide only; the following page is blank. **Still no design.**

---

## Changes to existing screens

| Page | Change | Effect on the portal |
|---|---|---|
| 53 | Quote request document signed "USER / DEALER NAME" instead of "RUF DIAMOND TEAM" | Change the signature block on the quote document |
| 80 | Model page shows **Search by Description** again | Conflicts with the 31 Aug decision to remove it — confirm |
| 3, 7, 8 | Explanatory notes for Website, Social media and News trimmed | Wording only; no feature change |
| 54–55 | "Accept complete or selected quotation" and Xero-numbering sentences removed | Superseded by the Quote Status and order screens above |

---

## Questions for RUF Diamond

1. **Discount.** The cart and order show a Discount line (10% in the sample).
   Where does it come from — a per-company rate, per part, or entered by the
   admin?
2. **Factory Price column.** p54 requires separate Factory and Customer prices,
   but the admin table on p58 shows one Unit Price. Add a Factory Price column
   beside it?
3. **Two PO numbers.** The order form's PO No. (`4500689756`) looks like the
   customer's own PO; p55 has the admin assigning a Xero PO later. Confirm these
   are different numbers and both are stored.
4. **Shipping options.** The quote request offers Standard / Expedited; the
   order offers three named carriers. Should the quote request use the carriers
   too?
5. **Schedule orders.** Does the shipping method still apply? p65 says carriers
   apply to Regular and Urgent only.
6. **"None of the boxes are mutually exclusive"** (p69, Note 2) — which boxes?
   Order type reads as choose-one.
7. **Numbering.** Quote numbers `RD-00001`, order numbers `00001` — one sequence
   each, across all brands?
8. **Notify Customer** — email, an in-portal message, or both?
9. **Search by Description** — restore it (p80) or keep it removed?
10. **Order Status** — still needs a design.
11. **Linked images** — toolbar icons and logo are missing from the export again.

### Raised while building Quote Status (13 Oct)

Each is built the way described, pending confirmation.

12. **When does the customer see the response?** Built: only after the
    administrator sets *Notify Customer* to YES. Until then the line reads
    "Awaiting RUF Diamond's response".
13. **Discount on quoted prices.** Built: a quoted Customer Price is final, so
    the account discount is not applied to it again in the cart. List-price
    parts in the same cart still get the discount.
14. **Which lines can be ordered?** Built: Available = YES or PARTIAL, within
    the 30 days. NO (back-ordered) lines cannot be added. Should a customer be
    able to order a back-ordered part and wait for it?
15. **After 30 days.** Built: the line shows "Expired" and cannot be added to
    the cart. Should the customer instead be able to ask for a re-quote from
    that line?
16. **"Add to Cart?" column.** Built as a record of the customer's decision:
    "Yes" once the line is on the cart, otherwise "No". Is that what it means,
    or should it stay "Yes" after the order is placed (for the tracking
    described on p59)?
17. **Quantity.** The confirmation lets the customer change the quoted
    quantity before adding. Allowed, or must quoted lines be ordered at the
    quoted quantity?
18. **Account code.** The Customer column shows a short code (e.g. "SAV").
    Where does each account's code come from?

---

## What already exists in the code

- Rail already matches (Home, Fat Truck, IronHorse, Agilis, Quote Status, Order
  Status, Technical Info, Support, Website).
- `/quotes` and `/orders` are "Awaiting design" placeholders.
- **Built (screens 3 and 4):** Add to Cart on the figure and search pages opens
  the confirmation (`src/components/AddToCartDialog.tsx`), and Check Cart opens
  the drop-down (`src/components/CheckCart.tsx`). The Discount line uses the
  account's existing `discountRate`. Checkout leads to `/request` until the
  Order Request page exists.
- **Built (screen 2):** customer Quote Status at `/quotes`
  (`src/app/(portal)/quotes/`), on sample records in
  `src/data/quote-status.server.ts`. The customer view is built on the server
  by `toCustomerQuoteLines` (`src/lib/quote-status.ts`) and carries no Factory
  Price. Quoted lines go on the cart at the quoted price with their quote
  number. In API mode the page says it is not available yet, since no quote
  service exists.
- `/request` has the quote request with the optional shipping estimate, and the
  quote document with Print / Save PDF.
- **Backend:** there is no quote, order, cart, address or notification service
  in `apps/api`. `packages/contracts/src/orders.ts` has an order-status type only.
  Real submission is gated as unavailable (`frontend-customer-boundary.md`).
