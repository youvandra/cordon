import { createContext, forwardRef, useContext, useId, useState } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { motion } from "framer-motion";
import { transition } from "../../tokens/motion";
import { useCordon } from "../CordonProvider";
import { cx } from "../cx";

/* ==========================================================================
   Glossary: "Checkboxes", "Radio buttons", "Toggle".
   Three answers to the same question — how many of these may be true at once
   — so they share a box, a tick and a focus ring, and differ only in shape.
   ========================================================================== */

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label?: ReactNode;
  /** Quiet second line under the label. */
  description?: ReactNode;
  /** Neither on nor off — "some of the children are checked". */
  indeterminate?: boolean;
  invalid?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, indeterminate = false, invalid, className, id, ...rest },
  ref,
) {
  const reactId = useId();
  const inputId = id ?? `cordon-check-${reactId}`;
  const { reducedMotion } = useCordon();

  return (
    <div className={cx("cordon-choice", invalid && "cordon-choice--invalid", className)}>
      <span className="cordon-choice__box cordon-choice__box--check">
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          className="cordon-choice__input"
          aria-checked={indeterminate ? "mixed" : undefined}
          {...rest}
        />
        <motion.svg
          className="cordon-choice__mark"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <motion.path
            d={indeterminate ? "M6 12h12" : "M5 12.5 10 17.5 19 6.5"}
            initial={false}
            animate={{ pathLength: 1 }}
            transition={reducedMotion ? { duration: 0 } : transition.control}
          />
        </motion.svg>
      </span>
      {label || description ? (
        <span className="cordon-choice__text">
          <label className="cordon-choice__label" htmlFor={inputId}>
            {label}
          </label>
          {description ? (
            <span className="cordon-choice__description">{description}</span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
});

/* ---- Radio --------------------------------------------------------------- */

interface RadioGroupContextValue {
  name: string;
  value?: string;
  onValueChange?: (value: string) => void;
}

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

export interface RadioGroupProps {
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Lay the options out side by side. */
  orientation?: "vertical" | "horizontal";
  label?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function RadioGroup({
  name,
  value,
  defaultValue,
  onValueChange,
  orientation = "vertical",
  label,
  children,
  className,
}: RadioGroupProps) {
  const reactId = useId();
  const [internal, setInternal] = useState(defaultValue);
  const current = value ?? internal;

  return (
    <RadioGroupContext.Provider
      value={{
        name: name ?? `cordon-radio-${reactId}`,
        value: current,
        onValueChange: (next) => {
          if (value === undefined) setInternal(next);
          onValueChange?.(next);
        },
      }}
    >
      <div
        role="radiogroup"
        aria-label={typeof label === "string" ? label : undefined}
        className={cx("cordon-radiogroup", `cordon-radiogroup--${orientation}`, className)}
      >
        {label ? <span className="cordon-radiogroup__label">{label}</span> : null}
        <div className="cordon-radiogroup__options">{children}</div>
      </div>
    </RadioGroupContext.Provider>
  );
}

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value"> {
  value: string;
  label?: ReactNode;
  description?: ReactNode;
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { value, label, description, className, id, onChange, ...rest },
  ref,
) {
  const group = useContext(RadioGroupContext);
  const reactId = useId();
  const inputId = id ?? `cordon-radio-${reactId}`;

  return (
    <div className={cx("cordon-choice", className)}>
      <span className="cordon-choice__box cordon-choice__box--radio">
        <input
          ref={ref}
          id={inputId}
          type="radio"
          className="cordon-choice__input"
          name={group?.name}
          value={value}
          checked={group ? group.value === value : undefined}
          onChange={(event) => {
            group?.onValueChange?.(value);
            onChange?.(event);
          }}
          {...rest}
        />
        <span className="cordon-choice__dot" aria-hidden="true" />
      </span>
      {label || description ? (
        <span className="cordon-choice__text">
          <label className="cordon-choice__label" htmlFor={inputId}>
            {label}
          </label>
          {description ? (
            <span className="cordon-choice__description">{description}</span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
});

/* ---- Toggle -------------------------------------------------------------- */

export interface ToggleProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  size?: "sm" | "md";
  /** Which glaze the track is fired in when on. */
  glaze?: "rose" | "violet" | "ember";
  id?: string;
  className?: string;
}

/**
 * Glossary: "Toggle". A switch commits immediately — if the change needs a
 * Save button, the control should have been a Checkbox.
 */
export function Toggle({
  checked,
  defaultChecked = false,
  onCheckedChange,
  label,
  description,
  disabled = false,
  size = "md",
  glaze,
  id,
  className,
}: ToggleProps) {
  const reactId = useId();
  const inputId = id ?? `cordon-toggle-${reactId}`;
  const [internal, setInternal] = useState(defaultChecked);
  const isOn = checked ?? internal;
  const { reducedMotion, glaze: houseGlaze } = useCordon();

  return (
    <div className={cx("cordon-toggle", `cordon-toggle--${size}`, className)}>
      <button
        id={inputId}
        type="button"
        role="switch"
        aria-checked={isOn}
        aria-labelledby={label ? `${inputId}-label` : undefined}
        disabled={disabled}
        data-glaze={glaze ?? houseGlaze}
        className={cx("cordon-toggle__track", isOn && "cordon-toggle__track--on")}
        onClick={() => {
          if (checked === undefined) setInternal(!isOn);
          onCheckedChange?.(!isOn);
        }}
      >
        <motion.span
          className="cordon-toggle__thumb"
          layout
          transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 34 }}
        />
      </button>
      {label || description ? (
        <span className="cordon-choice__text">
          <label id={`${inputId}-label`} className="cordon-choice__label" htmlFor={inputId}>
            {label}
          </label>
          {description ? (
            <span className="cordon-choice__description">{description}</span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
