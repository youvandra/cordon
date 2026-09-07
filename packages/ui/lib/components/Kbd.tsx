import { cx } from "../cx";

/* ==========================================================================
   Kbd — a keyboard key is a tile, so it is drawn as one: a small fired
   surface with the rim highlight on top and a hard shadow underneath.
   ========================================================================== */

export interface KbdProps {
  /** e.g. ["⌘", "K"]. Each becomes its own key. */
  keys: string[];
  size?: "sm" | "md";
  className?: string;
}

export function Kbd({ keys, size = "sm", className }: KbdProps) {
  return (
    <span className={cx("cordon-kbd", `cordon-kbd--${size}`, className)}>
      {keys.map((key, index) => (
        <kbd key={index} className="cordon-kbd__key">
          {key}
        </kbd>
      ))}
    </span>
  );
}
