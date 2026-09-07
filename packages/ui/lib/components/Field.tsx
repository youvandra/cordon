import { createContext, forwardRef, useContext } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "./Icon";
import { useCordonId } from "../../hooks/useId";
import { transition } from "../../tokens/motion";
import { cx } from "../cx";

/* ==========================================================================
   Field — glossary: "Form field states".
   The six states a field can be in are declared once, here, so that a search
   box, a date picker and a textarea cannot drift apart in how they signal
   "you got this wrong".
   ========================================================================== */

export type FieldState = "default" | "focus" | "filled" | "disabled" | "error" | "success";

export interface FieldContextValue {
  id: string;
  descriptionId?: string;
  errorId?: string;
  state: FieldState;
  invalid: boolean;
  disabled: boolean;
  required: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

export function useField(): FieldContextValue | null {
  return useContext(FieldContext);
}

export interface FieldProps extends Omit<HTMLAttributes<HTMLDivElement>, "id"> {
  label?: ReactNode;
  /** Quiet helper text under the control. */
  hint?: ReactNode;
  /** Present = the field is in its error state. Replaces the hint. */
  error?: ReactNode;
  /** Present = the field is in its success state. */
  success?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  /** Marks the field as filled for styling; controls set this themselves. */
  filled?: boolean;
  id?: string;
  children: ReactNode;
}

export const Field = forwardRef<HTMLDivElement, FieldProps>(function Field(
  { label, hint, error, success, required = false, disabled = false, filled = false, id, className, children, ...rest },
  ref,
) {
  const fieldId = useCordonId("field", id);
  const descriptionId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;

  const state: FieldState = disabled
    ? "disabled"
    : error
      ? "error"
      : success
        ? "success"
        : filled
          ? "filled"
          : "default";

  return (
    <FieldContext.Provider
      value={{ id: fieldId, descriptionId, errorId, state, invalid: Boolean(error), disabled, required }}
    >
      <div
        ref={ref}
        className={cx("cordon-field", `cordon-field--${state}`, className)}
        data-state={state}
        {...rest}
      >
        {label ? (
          <label className="cordon-field__label" htmlFor={fieldId}>
            {label}
            {required ? (
              <span className="cordon-field__required" aria-hidden="true">
                *
              </span>
            ) : null}
          </label>
        ) : null}

        <div className="cordon-field__control">{children}</div>

        <AnimatePresence initial={false} mode="wait">
          {error ? (
            <motion.p
              key="error"
              id={errorId}
              className="cordon-field__message cordon-field__message--error"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={transition.control}
            >
              <Icon name="alert" />
              {error}
            </motion.p>
          ) : success ? (
            <motion.p
              key="success"
              className="cordon-field__message cordon-field__message--success"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={transition.control}
            >
              <Icon name="check-circle" />
              {success}
            </motion.p>
          ) : hint ? (
            <motion.p
              key="hint"
              id={descriptionId}
              className="cordon-field__message"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={transition.control}
            >
              {hint}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    </FieldContext.Provider>
  );
});

/** Wiring a control inside a Field needs these four attributes, every time. */
export function fieldAria(field: FieldContextValue | null) {
  if (!field) return {};
  return {
    id: field.id,
    "aria-invalid": field.invalid || undefined,
    "aria-required": field.required || undefined,
    "aria-describedby":
      [field.errorId, field.descriptionId].filter(Boolean).join(" ") || undefined,
    disabled: field.disabled || undefined,
  } as const;
}
