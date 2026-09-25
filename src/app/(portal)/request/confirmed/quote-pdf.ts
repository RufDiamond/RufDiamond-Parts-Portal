import type { RequestConfirmation } from "@/state/RequestContext";
import type { PartUsageSummary } from "@/types/catalog";

/** A field the pilot has no data for yet, printed as the deck brackets it. */
const PENDING = "—";

/** Slide 53 is A4 portrait, and the printed sheet already matches it. */
const MARGIN = 48;

export function quoteFileName(reference: string): string {
  /* Windows rejects most punctuation in filenames, and the reference is the
     one part of this the customer will search for later. */
  return `quote-request-${reference.replace(/[^\w.-]+/g, "-")}.pdf`;
}

/**
 * The customer's quote request, as a file.
 *
 * `window.print()` cannot save anything on its own — it opens the browser's
 * dialogue and the customer has to find "Save as PDF" in it, which is what the
 * Save PDF button used to do. This builds the document instead, so the button
 * downloads.
 *
 * It redraws slide 53 rather than rasterising the screen: a screenshot of the
 * page would carry the portal's own colours into the document, lose the text
 * as text, and give the factory a picture they cannot copy a part number out
 * of. The content is the same content `QuoteDocument` renders — this stays in
 * step with it by hand, and `tests/quote-document.test.tsx` covers the shape
 * they share.
 *
 * Building and saving are separate so the document itself can be tested
 * without a browser: `buildQuotePdf` is pure, and saving is the one line that
 * needs a real download.
 */
export async function buildQuotePdf(
  confirmation: RequestConfirmation,
  usage: Record<string, PartUsageSummary>,
) {
  /* Loaded on demand: the library is far larger than this screen, and nobody
     who does not press the button should pay for it. */
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableModule.default;

  const { details, lines, reference, submittedAt } = confirmation;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const right = pageWidth - MARGIN;
  let y = MARGIN;

  const brand =
    details.brand ??
    lines
      .map((line) => usage[line.partId]?.productLineName)
      .find((name): name is string => Boolean(name)) ??
    null;

  const date = new Date(submittedAt).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const text = (
    value: string,
    size: number,
    style: "normal" | "bold" = "normal",
    gap = 14,
  ) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    for (const row of doc.splitTextToSize(value, right - MARGIN) as string[]) {
      y += gap;
      doc.text(row, MARGIN, y);
    }
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("RUF DIAMOND", MARGIN, y + 6);
  y += 6;

  doc.setFontSize(12);
  doc.text("Factory quote request", right, y, { align: "right" });
  y += 10;

  text("Requestor: RUF DIAMOND LTD.", 10);
  text(`Quote Request No.: ${reference}`, 10, "bold");
  text(`Date: ${date}`, 10);

  y += 6;
  doc.setDrawColor(150);
  doc.line(MARGIN, y, right, y);

  y += 4;
  text("Please provide a quotation for the following parts for:", 10);
  text(`Brand: ${brand ?? PENDING}`, 10, "bold");

  y += 10;
  text("Parts requested", 12, "bold");

  autoTable(doc, {
    startY: y + 8,
    margin: { left: MARGIN, right: MARGIN },
    head: [[
      "Part number",
      "Description",
      "Qty",
      "Unit of measure",
      "Vehicle serial number",
      "Comments",
    ]],
    body: lines.map((line) => [
      line.partNumberSnapshot,
      line.descriptionSnapshot,
      String(line.qty),
      /* No unit of measure travels with the export; every part is priced each
         until the factory says otherwise. */
      "Unit",
      details.serial ?? usage[line.partId]?.serial ?? PENDING,
      details.comments[line.partId]?.trim() || "",
    ]),
    styles: { font: "helvetica", fontSize: 8, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [38, 38, 38], textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 74 },
      2: { cellWidth: 28, halign: "center" },
      3: { cellWidth: 62, halign: "center" },
      4: { cellWidth: 82 },
    },
    /* A table longer than the page repeats its headings rather than leaving
       later pages as unlabelled columns of numbers. */
    showHead: "everyPage",
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  /* Past roughly three quarters of the page there is no room for a heading and
     its paragraph together, and splitting them reads as a heading orphaned at
     the foot of a page. */
  const pageHeight = doc.internal.pageSize.getHeight();
  const breakIfTight = (needed: number) => {
    if (y + needed > pageHeight - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  y += 10;
  breakIfTight(60);
  text("Note 1 — General comments", 11, "bold");
  text(details.generalComment.trim() || "None supplied.", 10);

  y += 8;
  breakIfTight(60);
  text("Note 2 — Availability", 11, "bold");
  text(
    "Please confirm the availability of each requested part and indicate whether any part is currently on back order.",
    10,
  );

  /* Printed only when an estimate was actually requested. Slide 53 is explicit
     that the section is omitted otherwise, not left blank. */
  if (details.shipping) {
    y += 8;
    breakIfTight(80);
    text("Shipping cost estimate", 11, "bold");
    text("Please provide a shipping cost estimate to the following address:", 10);
    text(details.shipping.address || PENDING, 10);
    if (details.shipping.method) {
      text(
        `Method: ${details.shipping.method === "standard" ? "Standard shipping" : "Expedited shipping"}`,
        10,
      );
    }
  }

  y += 12;
  breakIfTight(70);
  text(
    "Thank you for your attention. We look forward to receiving your quotation and availability confirmation.",
    10,
  );
  y += 6;
  text("Respectfully,", 10);
  text("RUF DIAMOND TEAM", 10, "bold");

  return { doc, fileName: quoteFileName(reference) };
}

/** Builds the document and hands it to the browser as a download. */
export async function downloadQuotePdf(
  confirmation: RequestConfirmation,
  usage: Record<string, PartUsageSummary>,
): Promise<void> {
  const { doc, fileName } = await buildQuotePdf(confirmation, usage);
  doc.save(fileName);
}
