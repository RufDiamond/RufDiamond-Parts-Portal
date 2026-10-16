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
   apply to Regular and Urgent only. **Decided 13 Oct:** no — a scheduled order
   skips the carrier (see 20).
6. **"None of the boxes are mutually exclusive"** (p69, Note 2) — which boxes?
   Order type reads as choose-one. **Still open — for the supervisor / RUF.**
7. **Numbering.** Quote numbers `RD-00001`, order numbers `00001` — one sequence
   each, across all brands?
8. **Notify Customer** — email, an in-portal message, or both?
9. **Search by Description** — restore it (p80) or keep it removed?
10. **Order Status** — still needs a design.
11. **Linked images** — toolbar icons and logo are missing from the export again.
    **Decided 13 Oct:** keep using the icons and logo already in the portal; no
    re-export needed.

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
    quantity before adding. **Decided 13 Oct:** allowed — the customer picks the
    quantity. Already built this way.
18. **Account code.** The Customer column shows a short code (e.g. "SAV").
    Where does each account's code come from?

### Raised while building the Order Request (13 Oct)

19. **PO and VIN required?** Built: both are required. The VIN list is the
    account's own machine serials, plus "Other…" to type one.
20. **Scheduled orders skip the carrier.** Built per p65: Regular and Urgent
    choose a carrier; a scheduled order does not, and RUF Diamond arranges it.
    **Decided 13 Oct:** confirmed. (The reminder to the administrator and the early note to the
    factory need the order service; nothing is sent yet.)
21. **Saved addresses and serial numbers.** The form starts filled from the
    account's shipping address, billing address and machine serials. Who keeps
    those up to date — RUF Diamond, or the customer from their profile? If the
    customer edits an address during an order, should it be saved back?
22. **Taxes.** The order shows totals before tax, as the cart does. Is tax added
    on RUF Diamond's invoice, outside the portal?
23. **Signature on the dealer's quote copy.** Done: the dealer copy is signed
    with the dealer's name (p53). The deck also puts the user's name above it,
    but accounts don't hold a user name yet. The factory copy — the only one
    customers currently see, per the 17 Sep review — still signs "RUF DIAMOND
    TEAM", since its signature runs off the slide. Confirm the factory copy is
    unchanged.

24. **Quote or order from the same cart.** A cart can now go either to Request
    a Quote or to Checkout. Can a customer order catalogue parts directly at
    list price without a quote, or must every order start from a quotation?

---

## Supervisor's answers — 14 October 2026

Received 14 Oct at 7:23 pm EDT. The supervisor's numbering follows the
fifteen questions sent on 14 Oct; the bracket gives the matching question
above.

| # | Question | Answer | In the portal |
|---|---|---|---|
| 1 | Factory Price on the admin screen (Q2) | Add it straight after Qty — the tenth column | **Done.** `/quotes/admin`, column 10 |
| 2 | Search by Description (Q9) | Must be enabled; slides 22–27 | **Done** (`a31e536`) |
| 3 | When the customer sees the reply (Q12) | Blank until the factory PDF arrives; admin enters it and presses Notify Customer | **Done.** A submitted request appears blank in Quote Status; Notify Customer releases it |
| 4 | Ordering a back-ordered part (Q14) | Yes — order any quantity; what's missing goes on back order | **Done** (`acda8c7`) |
| 5 | After 30 days (Q15) | Customer can request a new quotation | **Done.** "Request new quote" on expired lines |
| 6 | Discount on quoted prices (Q13) | Discount applied once, at the end; dealers only; full prices shown until ordering | **Part done** — see follow-up B |
| 7 | Customer codes (Q18) | Show the full company name instead | **Done** (`09dd7a6`) |
| 8 | How the customer is told (Q8) | Both: in the portal, and by email | **Portal done** (New badge, counter on the Quote Status button). **Email needs a mail service** |
| 9 | PO and VIN required (Q19) | Mandatory — invoices are refused without a PO; parts differ by VIN | Already built |
| 10 | Addresses and serials (Q21) | Enter the address the first time, "Save this new address", newest saved fills in; serial typed every order | **Done** (`aa35a5d`) |
| 11 | Tax (Q22) | RUF handles tax on its invoice, outside the portal | Already built |
| 12 | Ordering without a quote (Q24) | Yes — that is how the portal should work | Already built |
| 13 | Numbering (Q7) | FT-/IH-/BP- per brand if simple; otherwise one sequence | **Open** — see follow-up C |
| 14 | Dealer discount (Q1) | 10% for the five dealers; must be able to set it for a new dealer | **Dealers done** (`09dd7a6`). Setting it needs an admin screen — follow-up F |
| 15 | The p69 note (Q6) | Changing one field must not clear the others | Already built |

Not covered by the reply, still open: Q3 (two PO numbers), Q4 (carriers on
the quote request), Q10 (Order Status design), Q16 (what "Add to Cart?"
records), Q23 (signature on the factory copy).

### Follow-ups sent back on 14 Oct

- **A. One notice per quote.** Built as proposed: Notify Customer releases the
  ticked lines and produces one notice per quote, however many lines. Awaiting
  confirmation.
- **B. Discount on quoted prices.** Open. The dealer discount currently comes
  off catalogue prices only, not quoted ones. Should a part quoted at $500
  cost a dealer $450?
- **C. Order numbers per brand.** Open. Which number does an order with two
  brands' parts get — split per brand, or one sequence? Is BP right for Agilis?
  Do quotes take the prefixes too?
- **D. Order Status.** Open. Needs a design and its list of statuses.
- **E. Portal notification.** Built as proposed: a red counter on the Quote
  Status button, and answered lines marked New until the customer leaves the
  page. Awaiting confirmation.
- **F. Setting a dealer's discount.** Open. Needs an admin screen for accounts.

### Built for the local demonstration only

There is no quote, notification or mail service behind the API. The quote
requests a customer submits and what the administrator enters against them
are kept in the browser (`src/state/quote-store.ts`), and nothing is emailed.
The administrator's screen has **no staff sign-in** yet: it is reachable from
"RUF Diamond view" on the customer's Quote Status in the demonstration, and
must move behind an administrator session before real customers use the
portal, because it shows Factory Price.

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
- **Built (screen 1):** the administrator's Quote Status at `/quotes/admin`
  (`src/app/(portal)/quotes/admin/`): every account's lines, newest first,
  filterable by product line, with Factory Price as the tenth column. Each
  line is filled in on the table; Notify Customer releases the ticked lines,
  one notice per quote; Add factory line records a part the factory quoted
  that was never asked for. Rules are in `src/lib/quote-status.ts`.
- **Built (screen 2):** customer Quote Status at `/quotes`
  (`src/app/(portal)/quotes/`), on sample records in
  `src/data/quote-status.server.ts`. The customer view is built on the server
  by `toCustomerQuoteLines` (`src/lib/quote-status.ts`) and carries no Factory
  Price. Quoted lines go on the cart at the quoted price with their quote
  number. In API mode the page says it is not available yet, since no quote
  service exists.
- **Built (screens 5 and 6):** the Order Request at `/checkout`
  (`src/app/(portal)/checkout/`), reached from Checkout on the cart. Five
  sections unlock in turn and turn green when complete; all stay editable,
  and a change that leaves a later section incomplete flags it (p69). The
  review shows the order terms with Back / Submit. Rules are in
  `src/lib/checkout.ts`; the account's addresses and serials come from
  `src/data/account-profile.server.ts`. Submitting records the order in the
  browser only and says so on screen — there is no order service yet.
- `/request` has the quote request with the optional shipping estimate, and the
  quote document with Print / Save PDF.
- **Backend:** there is no quote, order, cart, address or notification service
  in `apps/api`. `packages/contracts/src/orders.ts` has an order-status type only.
  Real submission is gated as unavailable (`frontend-customer-boundary.md`).
