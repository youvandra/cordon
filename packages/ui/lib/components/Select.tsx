import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "./Icon";
import { fieldAria, useField } from "./Field";
import { overlayVariants } from "../../tokens/motion";
import { cx } from "../cx";

/* ==========================================================================
   Glossary: "Dropdown / dropdown lists" (choosing a value) and "List boxes"
   (a list that is always visible). Same option model, two disclosures.
   ========================================================================== */

export interface SelectOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export interface SelectProps {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  id?: string;
}

export function Select({
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder = "Select…",
  disabled,
  invalid,
  size = "md",
  className,
  id,
}: SelectProps) {
  const field = useField();
  const aria = fieldAria(field);
  const [internal, setInternal] = useState(defaultValue);
  const current = value ?? internal;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = `cordon-select-${useId().replace(/[:»«]/g, "")}`;
  const selected = options.find((option) => option.value === current);

  const commit = (next: string) => {
    if (value === undefined) setInternal(next);
    onValueChange?.(next);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActiveIndex((index) => {
          let next = index;
          for (let i = 0; i < options.length; i++) {
            next = (next + step + options.length) % options.length;
            if (!options[next].disabled) break;
          }
          return next;
        });
      }
      if (event.key === "Enter" && activeIndex >= 0) {
        event.preventDefault();
        commit(options[activeIndex].value);
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
    <div ref={rootRef} className={cx("cordon-select", className)}>
      <button
        type="button"
        id={id ?? aria.id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-invalid={invalid ?? field?.invalid ?? undefined}
        aria-describedby={aria["aria-describedby"]}
        disabled={disabled ?? field?.disabled}
        className={cx(
          "cordon-input",
          `cordon-input--${size}`,
          "cordon-select__trigger",
          open && "cordon-input--focused",
          (invalid ?? field?.invalid) && "cordon-input--invalid",
          (disabled ?? field?.disabled) && "cordon-input--disabled",
        )}
        onClick={() => setOpen((state) => !state)}
      >
        <span className={cx("cordon-select__value", !selected && "cordon-select__value--placeholder")}>
          {selected?.label ?? placeholder}
        </span>
        <Icon name="chevron-down" className="cordon-input__icon cordon-select__chevron" />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.ul
            id={listId}
            role="listbox"
            className="cordon-select__list"
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {options.map((option, index) => (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={option.value === current}
                  disabled={option.disabled}
                  className={cx(
                    "cordon-select__option",
                    option.value === current && "cordon-select__option--selected",
                    index === activeIndex && "cordon-select__option--active",
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => commit(option.value)}
                >
                  <span className="cordon-select__option-text">
                    <span>{option.label}</span>
                    {option.description ? (
                      <span className="cordon-select__option-description">{option.description}</span>
                    ) : null}
                  </span>
                  {option.value === current ? <Icon name="check" className="cordon-select__check" /> : null}
                </button>
              </li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ---- List box ------------------------------------------------------------ */

export interface ListBoxProps {
  options: SelectOption[];
  /** Array for multiple; string for single. */
  value?: string | string[];
  onValueChange?: (value: string | string[]) => void;
  multiple?: boolean;
  /** Fixed height in px before it scrolls. */
  height?: number;
  label?: ReactNode;
  className?: string;
}

/**
 * Glossary: "List boxes". Always visible, so it is honest about how many
 * choices there are — which a dropdown is not.
 */
export function ListBox({ options, value, onValueChange, multiple = false, height = 200, label, className }: ListBoxProps) {
  const selected = Array.isArray(value) ? value : value ? [value] : [];

  const toggle = (next: string) => {
    if (!multiple) {
      onValueChange?.(next);
      return;
    }
    onValueChange?.(selected.includes(next) ? selected.filter((v) => v !== next) : [...selected, next]);
  };

  return (
    <div className={cx("cordon-listbox", className)}>
      {label ? <span className="cordon-listbox__label">{label}</span> : null}
      <ul
        role="listbox"
        aria-multiselectable={multiple || undefined}
        className="cordon-listbox__list"
        style={{ maxHeight: height }}
      >
        {options.map((option) => (
          <li key={option.value}>
            <button
              type="button"
              role="option"
              aria-selected={selected.includes(option.value)}
              disabled={option.disabled}
              className={cx("cordon-listbox__option", selected.includes(option.value) && "cordon-listbox__option--selected")}
              onClick={() => toggle(option.value)}
            >
              <span className="cordon-select__option-text">
                <span>{option.label}</span>
                {option.description ? (
                  <span className="cordon-select__option-description">{option.description}</span>
                ) : null}
              </span>
              {selected.includes(option.value) ? <Icon name="check" className="cordon-select__check" /> : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
