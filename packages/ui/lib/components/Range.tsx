import { forwardRef, useId, useState } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { Icon } from "./Icon";
import { useCordon } from "../CordonProvider";
import { cx } from "../cx";

/* ==========================================================================
   Glossary: "Slider controls", "Stepper".
   Both set a number. A slider is for values whose neighbours are equally
   acceptable; a stepper is for values you would type if typing were faster.
   ========================================================================== */

export interface SliderProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange"> {
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: ReactNode;
  /** Renders the live value beside the label. */
  showValue?: boolean;
  /** Formats the shown value. */
  format?: (value: number) => string;
  /** Tick marks under the track, one per step of this size. */
  ticks?: number;
  glaze?: "rose" | "violet" | "ember";
}

export const Slider = forwardRef<HTMLInputElement, SliderProps>(function Slider(
  {
    value,
    defaultValue = 0,
    onValueChange,
    min = 0,
    max = 100,
    step = 1,
    label,
    showValue = false,
    format = (n) => String(n),
    ticks,
    glaze,
    className,
    id,
    disabled,
    ...rest
  },
  ref,
) {
  const reactId = useId();
  const inputId = id ?? `cordon-slider-${reactId}`;
  const [internal, setInternal] = useState(defaultValue);
  const current = value ?? internal;
  const { glaze: houseGlaze } = useCordon();
  const percent = max === min ? 0 : ((current - min) / (max - min)) * 100;

  const tickMarks =
    ticks && ticks > 0
      ? Array.from({ length: Math.floor((max - min) / ticks) + 1 }, (_, i) => min + i * ticks)
      : null;

  return (
    <div
      className={cx("cordon-slider", disabled && "cordon-slider--disabled", className)}
      data-glaze={glaze ?? houseGlaze}
      style={{ "--cordon-slider-percent": `${percent}%` } as React.CSSProperties}
    >
      {label || showValue ? (
        <div className="cordon-slider__header">
          {label ? (
            <label className="cordon-slider__label" htmlFor={inputId}>
              {label}
            </label>
          ) : null}
          {showValue ? <span className="cordon-slider__value">{format(current)}</span> : null}
        </div>
      ) : null}

      <div className="cordon-slider__track">
        <span className="cordon-slider__fill" />
        <input
          ref={ref}
          id={inputId}
          type="range"
          className="cordon-slider__input"
          min={min}
          max={max}
          step={step}
          value={current}
          disabled={disabled}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (value === undefined) setInternal(next);
            onValueChange?.(next);
          }}
          {...rest}
        />
      </div>

      {tickMarks ? (
        <div className="cordon-slider__ticks" aria-hidden="true">
          {tickMarks.map((tick, index) => (
            <span
              key={tick}
              className={cx(
                "cordon-slider__tick",
                index % 5 === 0 && "cordon-slider__tick--major",
                tick <= current && "cordon-slider__tick--lit",
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
});

/* ---- Stepper ------------------------------------------------------------- */

export interface StepperProps {
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: ReactNode;
  /** Unit shown after the number, e.g. "ms". */
  unit?: ReactNode;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
  id?: string;
}

/**
 * Glossary: "Stepper". The value can only ever be a multiple of `step`, which
 * is the entire point — a stepper is a promise that there are no odd numbers.
 */
export function Stepper({
  value,
  defaultValue = 0,
  onValueChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  label,
  unit,
  disabled = false,
  size = "md",
  className,
  id,
}: StepperProps) {
  const reactId = useId();
  const inputId = id ?? `cordon-stepper-${reactId}`;
  const [internal, setInternal] = useState(defaultValue);
  const current = value ?? internal;

  const commit = (next: number) => {
    const clamped = Math.min(max, Math.max(min, next));
    if (value === undefined) setInternal(clamped);
    onValueChange?.(clamped);
  };

  return (
    <div className={cx("cordon-stepper", `cordon-stepper--${size}`, className)}>
      {label ? (
        <label className="cordon-stepper__label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <div className="cordon-stepper__control">
        <button
          type="button"
          className="cordon-stepper__button"
          aria-label="Decrease"
          disabled={disabled || current - step < min}
          onClick={() => commit(current - step)}
        >
          <Icon name="minus" />
        </button>
        <input
          id={inputId}
          type="number"
          className="cordon-stepper__input"
          value={current}
          min={min === -Infinity ? undefined : min}
          max={max === Infinity ? undefined : max}
          step={step}
          disabled={disabled}
          onChange={(event) => commit(Number(event.target.value))}
        />
        {unit ? <span className="cordon-stepper__unit">{unit}</span> : null}
        <button
          type="button"
          className="cordon-stepper__button"
          aria-label="Increase"
          disabled={disabled || current + step > max}
          onClick={() => commit(current + step)}
        >
          <Icon name="plus" />
        </button>
      </div>
    </div>
  );
}
