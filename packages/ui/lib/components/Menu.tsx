import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { Button } from "./Button";
import type { ButtonProps } from "./Button";
import { overlayVariants } from "../../tokens/motion";
import { cx } from "../cx";

/* ==========================================================================
   Glossary: "Dropdown / dropdown lists", "Dropdown buttons", "Hamburger
   menu", "Kebab menu", "Meatball menu", "Bento menu", "Döner menu icon".
   The five named menus differ only in their glyph and what they imply about
   the count of things inside, so they are one component with five triggers —
   and the glyph choice is documented rather than left to taste.
   ========================================================================== */

export interface MenuItem {
  id: string;
  label: ReactNode;
  icon?: IconName;
  /** Right-aligned hint: a shortcut, a count, a status. */
  meta?: ReactNode;
  disabled?: boolean;
  /** Renders in the critical tone and moves to its own group. */
  destructive?: boolean;
  onSelect?: () => void;
}

export interface MenuProps {
  items: (MenuItem | "separator")[];
  /** The element that opens the menu. Receives open state via `data-open`. */
  trigger: ReactNode;
  align?: "start" | "end";
  side?: "bottom" | "top";
  /** Menu width in px. Defaults to fitting its content. */
  width?: number;
  className?: string;
  onOpenChange?: (open: boolean) => void;
}

export function Menu({ items, trigger, align = "start", side = "bottom", width, className, onOpenChange }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = `cordon-menu-${useId().replace(/[:»«]/g, "")}`;

  const entries = items.filter((item): item is MenuItem => item !== "separator");

  const change = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
    if (!next) setActiveIndex(-1);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) change(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") change(false);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActiveIndex((index) => {
          let next = index;
          for (let i = 0; i < entries.length; i++) {
            next = (next + step + entries.length) % entries.length;
            if (!entries[next].disabled) break;
          }
          return next;
        });
      }
      if (event.key === "Enter" && activeIndex >= 0) {
        entries[activeIndex]?.onSelect?.();
        change(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  });

  return (
    <div ref={rootRef} className={cx("cordon-menu", className)}>
      <span
        className="cordon-menu__trigger"
        data-open={open || undefined}
        onClick={() => change(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
      >
        {trigger}
      </span>

      <AnimatePresence>
        {open ? (
          <motion.div
            id={menuId}
            role="menu"
            className={cx("cordon-menu__panel", `cordon-menu__panel--${align}`, `cordon-menu__panel--${side}`)}
            style={width ? { width } : undefined}
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {items.map((item, index) => {
              if (item === "separator") {
                return <span key={`sep-${index}`} className="cordon-menu__separator" role="separator" />;
              }
              const position = entries.indexOf(item);
              return (
                <button
                  key={item.id}
                  role="menuitem"
                  type="button"
                  disabled={item.disabled}
                  className={cx(
                    "cordon-menu__item",
                    item.destructive && "cordon-menu__item--destructive",
                    position === activeIndex && "cordon-menu__item--active",
                  )}
                  onMouseEnter={() => setActiveIndex(position)}
                  onClick={() => {
                    item.onSelect?.();
                    change(false);
                  }}
                >
                  {item.icon ? <Icon name={item.icon} className="cordon-menu__icon" /> : null}
                  <span className="cordon-menu__label">{item.label}</span>
                  {item.meta ? <span className="cordon-menu__meta">{item.meta}</span> : null}
                </button>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ---- Dropdown button ----------------------------------------------------- */

export interface DropdownButtonProps extends Omit<ButtonProps, "iconEnd" | "onSelect"> {
  items: (MenuItem | "separator")[];
  align?: MenuProps["align"];
  menuWidth?: number;
}

/** Glossary: "Dropdown buttons". A button whose job is to reveal a list. */
export function DropdownButton({ items, align, menuWidth, children, ...rest }: DropdownButtonProps) {
  return (
    <Menu
      items={items}
      align={align}
      width={menuWidth}
      trigger={
        <Button iconEnd="chevron-down" {...rest}>
          {children}
        </Button>
      }
    />
  );
}

/* ---- the five named menu glyphs ------------------------------------------ */

export type MenuGlyph = "hamburger" | "doner" | "kebab" | "meatball" | "bento";

/** What each glyph promises the viewer. Rendered verbatim in the docs. */
export const MENU_GLYPH_MEANING: Record<MenuGlyph, string> = {
  hamburger: "Full site navigation. Three equal lines: a complete list.",
  doner: "Filter or sort. Lines of decreasing length: a narrowing.",
  kebab: "Actions for one item. Vertical dots sit beside a row.",
  meatball: "Actions for a region. Horizontal dots sit under a header.",
  bento: "A grid of destinations you want seen at once, not read in order.",
};

export interface IconMenuProps extends Omit<MenuProps, "trigger"> {
  glyph: MenuGlyph;
  label: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
}

/**
 * The glossary's five menu icons, as one component. Picking the glyph is a
 * content decision — see `MENU_GLYPH_MEANING` — not a styling one.
 */
export function IconMenu({ glyph, label, size = "md", variant = "ghost", ...rest }: IconMenuProps) {
  return (
    <Menu
      {...rest}
      trigger={<Button iconOnly iconStart={glyph} aria-label={label} size={size} variant={variant} />}
    />
  );
}

/* ---- Drawer / Sidebar ---------------------------------------------------- */

export interface SidebarSection {
  title?: ReactNode;
  items: { id: string; label: ReactNode; icon?: IconName; badge?: ReactNode; disabled?: boolean }[];
}

export interface SidebarProps {
  sections: SidebarSection[];
  value?: string;
  onValueChange?: (id: string) => void;
  header?: ReactNode;
  footer?: ReactNode;
  /** Collapses to icons only. */
  collapsed?: boolean;
  className?: string;
}

/** Glossary: "Sidebar". */
export function Sidebar({ sections, value, onValueChange, header, footer, collapsed = false, className }: SidebarProps) {
  return (
    <nav
      className={cx("cordon-sidebar", collapsed && "cordon-sidebar--collapsed", className)}
      aria-label="Sidebar"
    >
      {header ? <div className="cordon-sidebar__header">{header}</div> : null}

      <div className="cordon-sidebar__scroll">
        {sections.map((section, index) => (
          <div key={index} className="cordon-sidebar__section">
            {section.title && !collapsed ? (
              <p className="cordon-sidebar__section-title">{section.title}</p>
            ) : null}
            <ul className="cordon-sidebar__list">
              {section.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={item.disabled}
                    aria-current={item.id === value ? "page" : undefined}
                    className={cx("cordon-sidebar__item", item.id === value && "cordon-sidebar__item--active")}
                    onClick={() => onValueChange?.(item.id)}
                    title={collapsed && typeof item.label === "string" ? item.label : undefined}
                  >
                    {item.icon ? <Icon name={item.icon} className="cordon-sidebar__icon" /> : null}
                    {!collapsed ? <span className="cordon-sidebar__label">{item.label}</span> : null}
                    {item.badge && !collapsed ? (
                      <span className="cordon-sidebar__badge">{item.badge}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {footer ? <div className="cordon-sidebar__footer">{footer}</div> : null}
    </nav>
  );
}

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  side?: "left" | "right";
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** The panel a hamburger menu opens on a narrow screen. */
export function Drawer({ open, onClose, side = "left", title, children, className }: DrawerProps) {
  return (
    <AnimatePresence>
      {open ? (
        <div className="cordon-drawer-layer">
          <motion.div
            className="cordon-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className={cx("cordon-drawer", `cordon-drawer--${side}`, className)}
            initial={{ x: side === "left" ? "-100%" : "100%" }}
            animate={{ x: 0 }}
            exit={{ x: side === "left" ? "-100%" : "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === "string" ? title : "Navigation"}
          >
            <div className="cordon-drawer__header">
              {title ? <h2 className="cordon-drawer__title">{title}</h2> : <span />}
              <button type="button" className="cordon-modal__close" aria-label="Close" onClick={onClose}>
                <Icon name="close" />
              </button>
            </div>
            <div className="cordon-drawer__body">{children}</div>
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
