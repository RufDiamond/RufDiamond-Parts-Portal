"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import styles from "./CroppedPart.module.css";

/** A region of the plate, in fractions of its width and height. */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CroppedPartProps {
  /** The plate the region was taken from. */
  src: string;
  rect: CropRect;
  /** "MODEL IMAGE > FAT TRUCK FT3 WAGON > CABIN > WINDOWS". */
  trail: string;
  /**
   * The longer navigation trail printed along the foot of the PDF, e.g.
   * "FIGURE SEARCH >> FAT TRUCK >> ... >> WINDOWS (FIG 6.1)". Slide 36.
   */
  footerTrail: string;
  date: string;
  onClose: () => void;
}

/**
 * The cropped-part panel — slide 33.
 *
 * The region is shown by scaling the plate behind a window rather than
 * producing a new image, so it stays as sharp as the source allows and needs
 * no canvas work.
 *
 * Print and Export to PDF both go through the browser's print dialogue. While
 * the panel is open it marks the document, and the print rules in globals.css
 * drop everything but this sheet — otherwise the whole portal prints round a
 * blank frame, because a CSS background does not print by default.
 *
 * The printed sheet is not the panel: slide 34 sets the mark and the date on
 * one line, the trail beneath, then the image. Everything the reader only
 * needs on screen carries `data-crop-hide`.
 */
export function CroppedPart({
  src,
  rect,
  trail,
  footerTrail,
  date,
  onClose,
}: CroppedPartProps) {
  const root = useRef<HTMLDivElement>(null);

  /*
   * Tag the chain from this sheet up to <body>.
   *
   * Print needs everything except this sheet GONE — not merely invisible.
   * `visibility: hidden` keeps a box's layout, so the portal still paginated
   * behind the sheet, and lifting the sheet out with `position: fixed` made it
   * worse: Chrome repeats a fixed element on every printed page, so the second
   * page came out carrying a second copy of the same crop. Marking the
   * ancestor path lets the print rules hide each level's other children by
   * `display: none`, which removes their layout altogether and leaves one page
   * with the sheet sitting in normal flow.
   */
  useEffect(() => {
    document.body.classList.add("printing-crop");

    const marked: HTMLElement[] = [];
    let node: HTMLElement | null = root.current;
    while (node && node !== document.body) {
      node.setAttribute("data-crop-path", "");
      marked.push(node);
      node = node.parentElement;
    }

    return () => {
      document.body.classList.remove("printing-crop");
      for (const el of marked) el.removeAttribute("data-crop-path");
    };
  }, []);

  /*
   * Both buttons open the same dialogue — the browser is what makes the file —
   * but they produce different sheets. The watermark and the foot belong to
   * the PDF only, so the export marks the document and the print rules branch
   * on it. The extra furniture is always in the DOM and hidden by CSS, which
   * keeps this a class toggle rather than a re-render the dialogue could race.
   */
  const sheet = (asPdf: boolean) => {
    document.body.classList.toggle("printing-pdf", asPdf);
    window.print();
    document.body.classList.remove("printing-pdf");
  };

  const w = Math.max(rect.w, 0.02);
  const h = Math.max(rect.h, 0.02);

  const view = {
    backgroundImage: `url(${src})`,
    backgroundSize: `${100 / w}% ${100 / h}%`,
    // The remaining travel is (1 - size), so the offset is the crop's position
    // as a fraction of that.
    backgroundPosition: `${w >= 1 ? 50 : (rect.x / (1 - w)) * 100}% ${
      h >= 1 ? 50 : (rect.y / (1 - h)) * 100
    }%`,
    aspectRatio: `${w} / ${h}`,
  };

  return (
    <div
      ref={root}
      className={styles.overlay}
      role="dialog"
      aria-label="Cropped part"
    >
      <div className={styles.panel} data-crop-sheet>
        <header className={styles.head} data-crop-head>
          <div className={styles.brand}>
            <Image
              src="/brand/crop-logo.png"
              alt="RUFDIAMOND"
              width={300}
              height={58}
              className={styles.logo}
            />
          </div>

          <div className={styles.actions} data-crop-hide>
            <button
              type="button"
              className={styles.action}
              onClick={() => sheet(false)}
            >
              <Image
                src="/toolbar/print.png"
                alt=""
                width={40}
                height={40}
                className={styles.actionIcon}
              />
              Print
            </button>
            <button
              type="button"
              className={styles.action}
              onClick={() => sheet(true)}
              title="Export uses the browser's print dialogue — choose Save as PDF"
            >
              <Image
                src="/toolbar/quote.png"
                alt=""
                width={40}
                height={52}
                className={styles.actionIcon}
              />
              Export to PDF
            </button>
            <button
              type="button"
              className={styles.close}
              onClick={onClose}
              aria-label="Close the cropped part"
            >
              <svg
                viewBox="0 0 12 12"
                width="12"
                height="12"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  d="M1.5 1.5 L10.5 10.5 M10.5 1.5 L1.5 10.5"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          {/*
            The icon and the title are screen furniture. On paper the deck's
            print view (slide 34) carries only the mark, the date and the
            trail, so both are dropped with the buttons.
          */}
          <div className={styles.titleBlock} data-crop-title-block>
            <Image
              src="/toolbar/crop.png"
              alt=""
              width={40}
              height={40}
              className={styles.titleIcon}
              data-crop-hide
            />
            <div>
              <p className={styles.title} data-crop-hide>
                Cropped part
              </p>
              <p className={styles.trail} data-crop-trail>
                {trail}
              </p>
            </div>
          </div>

          <p className={styles.date} data-crop-date>
            Date: {date}
          </p>
        </header>

        <div className={styles.stage} data-crop-stage>
          <div className={styles.view} style={view} />
          {/* Slide 36 lays the mark faintly across the plate on the PDF. */}
          <Image
            src="/brand/crop-logo.png"
            alt=""
            width={300}
            height={58}
            className={styles.watermark}
            data-crop-pdf
          />
        </div>

        {/* The page foot: where the part was found, and the page count. */}
        <footer className={styles.foot} data-crop-foot>
          <span className={styles.footTrail}>{footerTrail}</span>
          <span className={styles.footPage}>Page 1 of 1</span>
        </footer>
      </div>
    </div>
  );
}
