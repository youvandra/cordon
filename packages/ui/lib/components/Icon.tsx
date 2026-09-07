import { forwardRef } from "react";
import type { SVGAttributes } from "react";
import { cx } from "../cx";

/* ==========================================================================
   Icon — glossary: "Icon", and the raw material for every menu glyph below.
   One grid (24), one stroke (1.6), round joins. Cordon icons are drawn, not
   filled, so they sit on a glaze without punching a hole in it.
   ========================================================================== */

export const CORDON_ICONS = {
  "chevron-down": "M6 9.5 12 15.5 18 9.5",
  "chevron-up": "M6 14.5 12 8.5 18 14.5",
  "chevron-left": "M14.5 6 8.5 12 14.5 18",
  "chevron-right": "M9.5 6 15.5 12 9.5 18",
  "arrow-right": "M4 12h15M13 6l6 6-6 6",
  "arrow-left": "M20 12H5M11 18l-6-6 6-6",
  "arrow-up-right": "M7 17 17 7M8 7h9v9",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  close: "M6 6l12 12M18 6L6 18",
  check: "M4.5 12.5 9.5 17.5 19.5 6.5",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M16.2 16.2 21 21",
  share: "M15 6a3 3 0 1 0 0 .01M6 12a3 3 0 1 0 0 .01M15 18a3 3 0 1 0 0 .01M8.6 10.6l4.9-2.9M8.6 13.4l4.9 2.9",
  hamburger: "M4 7h16M4 12h16M4 17h16",
  doner: "M4 7h16M4 12h11M4 17h6",
  kebab: "M12 6a.9.9 0 1 0 0 .01M12 12a.9.9 0 1 0 0 .01M12 18a.9.9 0 1 0 0 .01",
  meatball: "M6 12a.9.9 0 1 0 0 .01M12 12a.9.9 0 1 0 0 .01M18 12a.9.9 0 1 0 0 .01",
  bento: "M5 5h4v4H5zM10 5h4v4h-4zM15 5h4v4h-4zM5 10h4v4H5zM10 10h4v4h-4zM15 10h4v4h-4zM5 15h4v4H5zM10 15h4v4h-4zM15 15h4v4h-4z",
  calendar: "M4 7.5a1.5 1.5 0 0 1 1.5-1.5h13A1.5 1.5 0 0 1 20 7.5v11A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5zM4 10.5h16M8.5 4v4M15.5 4v4",
  clock: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17M12 7v5.3l3.4 2",
  info: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17M12 11v5.5M12 7.6v.01",
  warning: "M12 4 21 19.5H3zM12 10v4.2M12 17v.01",
  alert: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17M12 7.5v5.2M12 16v.01",
  "check-circle": "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17M8 12.2l2.9 2.8L16.4 9.5",
  star: "M12 4l2.5 5.3 5.5.7-4 4 1 5.6L12 17l-5 2.6 1-5.6-4-4 5.5-.7z",
  heart: "M12 20s-7.5-4.4-7.5-9.4A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7.5 2.6c0 5-7.5 9.4-7.5 9.4",
  bell: "M6.5 17V11a5.5 5.5 0 1 1 11 0v6M4.5 17h15M10 20a2 2 0 0 0 4 0",
  user: "M12 4a3.6 3.6 0 1 0 0 7.2A3.6 3.6 0 0 0 12 4M5 20c0-3.4 3.1-5.4 7-5.4s7 2 7 5.4",
  home: "M4 11 12 4l8 7M6.5 9.6V20h11V9.6",
  settings: "M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8M12 3v2M12 19v2M4.2 7.5l1.8 1M18 15.5l1.8 1M4.2 16.5l1.8-1M18 8.5l1.8-1",
  filter: "M4 6h16l-6.2 7.3V19l-3.6-1.9v-3.8z",
  sort: "M7 5v14M4 16l3 3 3-3M17 19V5M14 8l3-3 3 3",
  external: "M14 5h5v5M19 5l-8.5 8.5M17 13.5V19H5V7h5.5",
  copy: "M9 9h9.5v11H9zM15 6H5.5v11H9",
  trash: "M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 10.5v6M14 10.5v6",
  edit: "M4 20l.9-4.2L15.4 5.3a1.8 1.8 0 0 1 2.6 0l.7.7a1.8 1.8 0 0 1 0 2.6L8.2 19.1zM13.8 7l3.2 3.2",
  eye: "M2.8 12S6.6 6 12 6s9.2 6 9.2 6-3.8 6-9.2 6-9.2-6-9.2-6M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6",
  "eye-off": "M4 4l16 16M9.6 9.7a2.8 2.8 0 0 0 3.9 3.9M6.4 6.6C4.2 8.1 2.8 12 2.8 12S6.6 18 12 18c1.6 0 3-.5 4.2-1.2M18.6 15A14 14 0 0 0 21.2 12S17.4 6 12 6c-.6 0-1.2.1-1.7.2",
  upload: "M12 16V4.5M8 8l4-4 4 4M4.5 15v4.5h15V15",
  download: "M12 4.5V16M8 12l4 4 4-4M4.5 15v4.5h15V15",
  image: "M4 6.5h16v11H4zM4 15l4.5-4.2 3.3 3 3-2.6L20 15M9 9.4a1 1 0 1 0 0 .01",
  link: "M10.5 13.5a3.6 3.6 0 0 0 5.1 0l2.6-2.6a3.6 3.6 0 0 0-5.1-5.1l-1.3 1.3M13.5 10.5a3.6 3.6 0 0 0-5.1 0l-2.6 2.6a3.6 3.6 0 0 0 5.1 5.1l1.3-1.3",
  play: "M8 5.5 18.5 12 8 18.5z",
  pause: "M9 5.5v13M15 5.5v13",
  refresh: "M20 5.5v5h-5M4 18.5v-5h5M19.2 10.4A7.5 7.5 0 0 0 6.3 8.1M4.8 13.6a7.5 7.5 0 0 0 12.9 2.3",
  grip: "M9 6a.9.9 0 1 0 0 .01M15 6a.9.9 0 1 0 0 .01M9 12a.9.9 0 1 0 0 .01M15 12a.9.9 0 1 0 0 .01M9 18a.9.9 0 1 0 0 .01M15 18a.9.9 0 1 0 0 .01",
  tag: "M4.5 11.4V4.5H11.4l8.1 8.1-6.9 6.9zM8 8v.01",
  layers: "M12 4 3.5 8.5 12 13l8.5-4.5zM3.5 13.5 12 18l8.5-4.5",
  bolt: "M13.5 3 5.5 13.5h5L10 21l8.5-10.5h-5z",
  globe: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17M3.6 12h16.8M12 3.5c4.5 5 4.5 12 0 17M12 3.5c-4.5 5-4.5 12 0 17",
  spinner: "M12 3.5v3.2M12 17.3v3.2M3.5 12h3.2M17.3 12h3.2M6 6l2.2 2.2M15.8 15.8 18 18M6 18l2.2-2.2M15.8 8.2 18 6",
} as const;

export type IconName = keyof typeof CORDON_ICONS;

export const iconNames = Object.keys(CORDON_ICONS) as IconName[];

export interface IconProps extends Omit<SVGAttributes<SVGSVGElement>, "name"> {
  name: IconName;
  /** Rendered size in px. Defaults to 1em so it tracks the type around it. */
  size?: number | string;
  strokeWidth?: number;
  /** Give it a label and it becomes an image; leave it off and it is decoration. */
  label?: string;
}

export const Icon = forwardRef<SVGSVGElement, IconProps>(function Icon(
  { name, size, strokeWidth = 1.6, label, className, ...rest },
  ref,
) {
  const d = CORDON_ICONS[name];
  return (
    <svg
      ref={ref}
      className={cx("cordon-icon", className)}
      viewBox="0 0 24 24"
      width={size ?? "1em"}
      height={size ?? "1em"}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      {...rest}
    >
      <path d={d} />
    </svg>
  );
});
