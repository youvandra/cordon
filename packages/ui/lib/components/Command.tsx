import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { Kbd } from "./Kbd";
import { spring } from "../../tokens/spring";
import { cx } from "../cx";

/* ==========================================================================
   Command palette.

   The one control that has become the shorthand for "this was built after
   2020". Cordon's is a glass panel — the same four-layer recipe as every
   other floating surface — with subsequence matching, grouped results and
   full keyboard operation.
   ========================================================================== */

export interface CommandItem {
  id: string;
  label: string;
  /** The group heading this falls under. */
  group?: string;
  icon?: IconName;
  /** Extra words that should match without being shown. */
  keywords?: string[];
  /** Shortcut hint, e.g. ["⌘", "K"]. */
  shortcut?: string[];
  onSelect?: () => void;
}

/**
 * Subsequence match, the thing people mean by "fuzzy": every character of the
 * query must appear in order. Contiguous runs and word starts score higher, so
 * "nds" finds "New DataSource" above "notes-index-sync".
 */
export function scoreCommand(query: string, text: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let score = 0;
  let cursor = 0;
  let run = 0;
  for (const char of q) {
    const found = t.indexOf(char, cursor);
    if (found === -1) return 0;
    run = found === cursor && cursor > 0 ? run + 1 : 0;
    const wordStart = found === 0 || /[\s\-_/.]/.test(t[found - 1]);
    score += 1 + run * 2 + (wordStart ? 3 : 0);
    cursor = found + 1;
  }
  /* Shorter haystacks win ties, so exact-ish labels beat long descriptions. */
  return score + Math.max(0, 12 - t.length * 0.1);
}

export interface CommandPaletteProps {
  items: CommandItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placeholder?: string;
  /** Shown when nothing matches. */
  empty?: ReactNode;
  /** Item ids to surface first when the query is empty. */
  recent?: string[];
}

export function CommandPalette({
  items,
  open,
  onOpenChange,
  placeholder = "Type a command or search…",
  empty,
  recent = [],
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    if (!query) {
      const pinned = recent
        .map((id) => items.find((item) => item.id === id))
        .filter((item): item is CommandItem => Boolean(item));
      const rest = items.filter((item) => !recent.includes(item.id));
      return [...pinned.map((item) => ({ ...item, group: "Recent" })), ...rest];
    }
    return items
      .map((item) => ({
        item,
        score: Math.max(
          scoreCommand(query, item.label),
          ...(item.keywords ?? []).map((word) => scoreCommand(query, word) * 0.8),
          item.group ? scoreCommand(query, item.group) * 0.5 : 0,
        ),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.item);
  }, [items, query, recent]);

  /* Group headings are positional: a heading renders when the group changes. */
  const rows = useMemo(() => {
    const out: ({ kind: "heading"; label: string } | { kind: "item"; item: CommandItem; index: number })[] = [];
    let lastGroup: string | undefined;
    let index = 0;
    for (const item of results) {
      if (item.group && item.group !== lastGroup) {
        out.push({ kind: "heading", label: item.group });
        lastGroup = item.group;
      }
      out.push({ kind: "item", item, index: index++ });
    }
    return out;
  }, [results]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  const run = useCallback(
    (item: CommandItem) => {
      item.onSelect?.();
      onOpenChange(false);
    },
    [onOpenChange],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") return onOpenChange(false);
    if (event.key === "ArrowDown" || (event.key === "n" && event.ctrlKey)) {
      event.preventDefault();
      setActive((index) => (index + 1) % Math.max(1, results.length));
    }
    if (event.key === "ArrowUp" || (event.key === "p" && event.ctrlKey)) {
      event.preventDefault();
      setActive((index) => (index - 1 + results.length) % Math.max(1, results.length));
    }
    if (event.key === "Enter" && results[active]) {
      event.preventDefault();
      run(results[active]);
    }
  };

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="cordon-command-layer">
          <motion.div
            className="cordon-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className="cordon-command"
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={spring.settle}
            onKeyDown={onKeyDown}
          >
            <div className="cordon-command__search">
              <Icon name="search" className="cordon-command__search-icon" />
              <input
                ref={inputRef}
                className="cordon-command__input"
                value={query}
                placeholder={placeholder}
                aria-label={placeholder}
                aria-autocomplete="list"
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setQuery(event.target.value)}
              />
              <Kbd keys={["Esc"]} />
            </div>

            <div ref={listRef} className="cordon-command__list" role="listbox">
              {rows.length ? (
                rows.map((row, position) =>
                  row.kind === "heading" ? (
                    <p key={`h-${position}`} className="cordon-command__heading">
                      {row.label}
                    </p>
                  ) : (
                    <button
                      key={row.item.id}
                      type="button"
                      role="option"
                      data-index={row.index}
                      aria-selected={row.index === active}
                      className={cx(
                        "cordon-command__item",
                        row.index === active && "cordon-command__item--active",
                      )}
                      onMouseMove={() => setActive(row.index)}
                      onClick={() => run(row.item)}
                    >
                      {row.item.icon ? (
                        <Icon name={row.item.icon} className="cordon-command__item-icon" />
                      ) : (
                        <span className="cordon-command__item-icon" />
                      )}
                      <span className="cordon-command__item-label">{row.item.label}</span>
                      {row.item.shortcut ? <Kbd keys={row.item.shortcut} /> : null}
                      {row.index === active ? (
                        <motion.span
                          layoutId="cordon-command-marker"
                          className="cordon-command__marker"
                          transition={spring.snap}
                        />
                      ) : null}
                    </button>
                  ),
                )
              ) : (
                <div className="cordon-command__empty">
                  {empty ?? (
                    <>
                      <Icon name="search" />
                      <span>No command matches “{query}”.</span>
                    </>
                  )}
                </div>
              )}
            </div>

            <footer className="cordon-command__footer">
              <span><Kbd keys={["↑", "↓"]} /> navigate</span>
              <span><Kbd keys={["↵"]} /> run</span>
              <span className="cordon-command__count">
                {results.length} of {items.length}
              </span>
            </footer>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

/**
 * Binds the palette to its shortcut. Separate from the component so the key
 * can be held by whatever already owns the app's keyboard map.
 */
export function useCommandShortcut(onOpen: () => void, key = "k") {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === key && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onOpen();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onOpen, key]);
}
