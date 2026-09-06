"use client";

import Image from "next/image";
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
  date: string;
  onClose: () => void;
}

/**
 * The cropped-part panel — slide 33.
 *
 * The region is shown by scaling the plate behind a window rather than
 * producing a new image, so it stays as sharp as the source allows and needs
 * no canvas work.
 */
export function CroppedPart({
  src,
  rect,
  trail,
  date,
  onClose,
}: CroppedPartProps) {
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
    <div className={styles.overlay} role="dialog" aria-label="Cropped part">
      <div className={styles.panel}>
        <header className={styles.head}>
          <div className={styles.brand}>
            <Image
              src="/brand/header-logo.png"
              alt="RUF Diamond"
              width={900}
              height={298}
              className={styles.logo}
            />
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.action}
              onClick={() => window.print()}
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
              onClick={() => window.print()}
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
              &times;
            </button>
          </div>

          <div className={styles.titleBlock}>
            <Image
              src="/toolbar/crop.png"
              alt=""
              width={40}
              height={40}
              className={styles.titleIcon}
            />
            <div>
              <p className={styles.title}>Cropped part</p>
              <p className={styles.trail}>{trail}</p>
            </div>
          </div>

          <p className={styles.date}>Date: {date}</p>
        </header>

        <div className={styles.stage}>
          <div className={styles.view} style={view} />
        </div>
      </div>
    </div>
  );
}
