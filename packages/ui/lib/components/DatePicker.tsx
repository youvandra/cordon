import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "./Icon";
import { overlayVariants } from "../../tokens/motion";
import { cx } from "../cx";

/* Glossary: "Date or time picker". */

const DAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function sameDay(a?: Date | null, b?: Date | null) {
  return Boolean(a && b && a.toDateString() === b.toDateString());
}
function monthGrid(month: Date): (Date | null)[] {
  const first = startOfMonth(month);
  const offset = (first.getDay() + 6) % 7; // weeks start Monday
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = Array.from({ length: offset }, () => null);
  for (let day = 1; day <= days; day++) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), day));
  }
  return cells;
}

export interface CalendarProps {
  value?: Date | null;
  onValueChange?: (date: Date) => void;
  min?: Date;
  max?: Date;
  /** Locale for the month heading. */
  locale?: string;
  className?: string;
}

export function Calendar({ value, onValueChange, min, max, locale = "en-GB", className }: CalendarProps) {
  const [month, setMonth] = useState(() => startOfMonth(value ?? new Date()));
  const cells = useMemo(() => monthGrid(month), [month]);
  const today = new Date();

  const heading = month.toLocaleDateString(locale, { month: "long", year: "numeric" });
  const blocked = (date: Date) => (min && date < min) || (max && date > max);

  return (
    <div className={cx("cordon-calendar", className)}>
      <div className="cordon-calendar__header">
        <button
          type="button"
          className="cordon-calendar__nav"
          aria-label="Previous month"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
        >
          <Icon name="chevron-left" />
        </button>
        <span className="cordon-calendar__heading" aria-live="polite">
          {heading}
        </span>
        <button
          type="button"
          className="cordon-calendar__nav"
          aria-label="Next month"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
        >
          <Icon name="chevron-right" />
        </button>
      </div>

      <div className="cordon-calendar__weekdays" aria-hidden="true">
        {DAY_LABELS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="cordon-calendar__grid" role="grid">
        {cells.map((date, index) =>
          date ? (
            <button
              key={index}
              type="button"
              role="gridcell"
              disabled={blocked(date)}
              aria-selected={sameDay(date, value)}
              aria-current={sameDay(date, today) ? "date" : undefined}
              className={cx(
                "cordon-calendar__day",
                sameDay(date, value) && "cordon-calendar__day--selected",
                sameDay(date, today) && "cordon-calendar__day--today",
              )}
              onClick={() => onValueChange?.(date)}
            >
              {date.getDate()}
            </button>
          ) : (
            <span key={index} className="cordon-calendar__spacer" />
          ),
        )}
      </div>
    </div>
  );
}

export interface DatePickerProps extends Omit<CalendarProps, "className"> {
  label?: ReactNode;
  placeholder?: string;
  /** Adds an hour/minute row under the calendar. */
  withTime?: boolean;
  disabled?: boolean;
  className?: string;
}

export function DatePicker({
  value,
  onValueChange,
  label,
  placeholder = "Pick a date",
  withTime = false,
  locale = "en-GB",
  disabled,
  className,
  ...rest
}: DatePickerProps) {
  const [open, setOpen] = useState(false);

  const printed = value
    ? value.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) +
      (withTime ? ` · ${value.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}` : "")
    : placeholder;

  return (
    <div className={cx("cordon-datepicker", className)}>
      {label ? <span className="cordon-field__label">{label}</span> : null}
      <button
        type="button"
        className={cx("cordon-input", "cordon-input--md", "cordon-datepicker__trigger", open && "cordon-input--focused", disabled && "cordon-input--disabled")}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((state) => !state)}
      >
        <Icon name="calendar" className="cordon-input__icon" />
        <span className={cx("cordon-select__value", !value && "cordon-select__value--placeholder")}>{printed}</span>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            role="dialog"
            aria-label="Choose a date"
            className="cordon-datepicker__panel"
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <Calendar
              value={value}
              locale={locale}
              onValueChange={(date) => {
                const next = new Date(date);
                if (withTime && value) {
                  next.setHours(value.getHours(), value.getMinutes());
                }
                onValueChange?.(next);
                if (!withTime) setOpen(false);
              }}
              {...rest}
            />
            {withTime ? (
              <div className="cordon-datepicker__time">
                <Icon name="clock" />
                <input
                  type="time"
                  className="cordon-datepicker__time-input"
                  aria-label="Time"
                  value={
                    value
                      ? `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`
                      : ""
                  }
                  onChange={(event) => {
                    const [hours, minutes] = event.target.value.split(":").map(Number);
                    const next = new Date(value ?? new Date());
                    next.setHours(hours || 0, minutes || 0);
                    onValueChange?.(next);
                  }}
                />
                <button type="button" className="cordon-datepicker__done" onClick={() => setOpen(false)}>
                  Done
                </button>
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
