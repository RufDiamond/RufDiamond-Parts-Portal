import styles from "./Icon.module.css";

/**
 * The icon set used by the reference. Line icons on a 24 grid, stroked in
 * currentColor so they inherit whatever surface they sit on.
 */
export type IconName =
  | "arrow-left"
  | "arrow-right"
  | "chevron-right"
  | "check"
  | "plus"
  | "minus"
  | "download"
  | "printer"
  | "trash"
  | "clipboard-list"
  | "search-x"
  | "layers"
  | "box"
  | "armchair"
  | "layout-grid"
  | "cog"
  | "zap"
  | "truck"
  | "package"
  | "waves"
  | "circle-dot"
  | "home"
  | "receipt"
  | "truck-delivery"
  | "mail"
  | "globe"
  | "cart"
  | "crop"
  | "file-pdf"
  | "chevron-left"
  | "chevrons-left"
  | "chevrons-right";

export type IconSize = "sm" | "md" | "lg";

export interface IconProps {
  name: IconName;
  size?: IconSize;
  className?: string;
}

const PATHS: Record<IconName, React.ReactNode> = {
  "arrow-left": (
    <>
      <path d="M19 12H5" />
      <path d="M11 18l-6-6 6-6" />
    </>
  ),
  "arrow-right": (
    <>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </>
  ),
  "chevron-right": <path d="M9 5l7 7-7 7" />,
  "chevron-left": <path d="M15 5l-7 7 7 7" />,
  "chevrons-left": (
    <>
      <path d="M11 5l-7 7 7 7" />
      <path d="M19 5l-7 7 7 7" />
    </>
  ),
  "chevrons-right": (
    <>
      <path d="M13 5l7 7-7 7" />
      <path d="M5 5l7 7-7 7" />
    </>
  ),
  home: (
    <>
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </>
  ),
  receipt: (
    <>
      <path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
    </>
  ),
  "truck-delivery": (
    <>
      <path d="M3 6h11v9H3z" />
      <path d="M14 9h4l3 3v3h-7z" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  mail: (
    <>
      <path d="M3 5h18v14H3z" />
      <path d="M3 6l9 7 9-7" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z" />
    </>
  ),
  cart: (
    <>
      <path d="M3 4h2l2.4 10h9.8l2-7H6" />
      <circle cx="9" cy="19" r="1.6" />
      <circle cx="17" cy="19" r="1.6" />
    </>
  ),
  crop: (
    <>
      <path d="M6 2v16h16" />
      <path d="M2 6h16v16" />
    </>
  ),
  "file-pdf": (
    <>
      <path d="M6 2h8l4 4v16H6z" />
      <path d="M14 2v4h4" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </>
  ),
  check: <path d="M4 12.5l5 5L20 6.5" />,
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  minus: <path d="M5 12h14" />,
  download: (
    <>
      <path d="M12 3v12" />
      <path d="M7 11l5 5 5-5" />
      <path d="M4 20h16" />
    </>
  ),
  printer: (
    <>
      <path d="M7 9V3h10v6" />
      <path d="M4 9h16v7H4z" />
      <path d="M7 14h10v7H7z" />
    </>
  ),
  trash: (
    <>
      <path d="M4 6h16" />
      <path d="M9 6V3h6v3" />
      <path d="M6 6l1 15h10l1-15" />
    </>
  ),
  "clipboard-list": (
    <>
      <path d="M9 3h6v3H9z" />
      <path d="M6 4.5H4.5V21h15V4.5H18" />
      <path d="M8 11h8" />
      <path d="M8 15h8" />
    </>
  ),
  "search-x": (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5L21 21" />
      <path d="M8.5 8.5l4 4" />
      <path d="M12.5 8.5l-4 4" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3l9 4.5-9 4.5-9-4.5z" />
      <path d="M3 12.5l9 4.5 9-4.5" />
      <path d="M3 17l9 4.5 9-4.5" />
    </>
  ),
  box: (
    <>
      <path d="M12 3l9 4v10l-9 4-9-4V7z" />
      <path d="M3 7l9 4 9-4" />
      <path d="M12 11v10" />
    </>
  ),
  armchair: (
    <>
      <path d="M5 12V7a2 2 0 012-2h10a2 2 0 012 2v5" />
      <path d="M4 12h16v6H4z" />
      <path d="M7 18v3" />
      <path d="M17 18v3" />
    </>
  ),
  "layout-grid": (
    <>
      <path d="M4 4h7v7H4z" />
      <path d="M13 4h7v7h-7z" />
      <path d="M4 13h7v7H4z" />
      <path d="M13 13h7v7h-7z" />
    </>
  ),
  cog: (
    <>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2v3" />
      <path d="M12 19v3" />
      <path d="M2 12h3" />
      <path d="M19 12h3" />
      <path d="M5 5l2 2" />
      <path d="M17 17l2 2" />
      <path d="M19 5l-2 2" />
      <path d="M7 17l-2 2" />
    </>
  ),
  zap: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  truck: (
    <>
      <path d="M2 6h11v10H2z" />
      <path d="M13 9h4l4 4v3h-8z" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  package: (
    <>
      <path d="M12 3l9 4v10l-9 4-9-4V7z" />
      <path d="M7.5 5l9 4" />
      <path d="M3 7l9 4 9-4" />
    </>
  ),
  waves: (
    <>
      <path d="M3 7c2 0 2 2 4.5 2S10 7 12 7s2 2 4.5 2S19 7 21 7" />
      <path d="M3 12c2 0 2 2 4.5 2s2.5-2 4.5-2 2 2 4.5 2 2.5-2 4.5-2" />
      <path d="M3 17c2 0 2 2 4.5 2s2.5-2 4.5-2 2 2 4.5 2 2.5-2 4.5-2" />
    </>
  ),
  "circle-dot": (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
};

export function Icon({ name, size = "md", className }: IconProps) {
  return (
    <svg
      className={`${styles.icon} ${styles[size]} ${className ?? ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
