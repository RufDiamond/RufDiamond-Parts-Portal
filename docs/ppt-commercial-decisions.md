# PPT commercial decisions — locked defaults

Date: 2026-10-15. Source: V2 deck + 12–14 Oct supervisor answers + plan defaults
where RUF has not yet replied. Changing a default requires an explicit product note.

| Item | Decision |
| --- | --- |
| Discount on quoted Customer Price (B) | **No.** Quoted unit price is final; dealer discount applies only to catalogue list-price lines in the same cart. |
| Order / quote numbering (C) | **One sequence** `RD-#####` for quotes and orders for now. Brand prefixes (FT-/IH-/BP-) deferred. |
| Two PO numbers (Q3) | Customer PO on the order form is mandatory. RUF/Xero PO is admin-only later; portal does not auto-generate Xero numbers. |
| Quote carriers (Q4) | Quote request keeps Standard / Expedited. Order Request keeps named carriers (Purolator / Manitoulin); Schedule skips carrier. |
| Add to Cart? column (Q16) | Remains **Yes** once the line is on the cart for the visit. |
| Factory quote signature (Q23) | Factory copy stays **RUF DIAMOND TEAM**. Dealer copy signs with the dealer company name. |
| One notice per quote (A) | **Accepted.** Notify Customer releases ticked lines and emits one portal notice (and one email) per quote number. |
| Portal New counter (E) | **Accepted.** Red counter on Quote Status; lines stay New until the customer leaves the page. |
| Dealer discount rate (F) | Five dealers at 10%. Staff with `users.all.manage` can PATCH a company's `discountRate` via admin accounts API. |

These defaults govern the commerce API and UI until superseded.
