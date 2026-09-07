import { useCallback, useRef, useState } from "react";
import type { ClipboardEvent, KeyboardEvent, ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "./Icon";
import { DotText } from "../primitives/DotText";
import { spring } from "../../tokens/spring";
import { useCordonId } from "../../hooks/useId";
import { cx } from "../cx";

/* ==========================================================================
   Dropzone and OTP — the two inputs every product needs and no glossary lists.
   ========================================================================== */

export interface DropzoneFile {
  id: string;
  file: File;
  /** 0–100 while uploading. Undefined once done. */
  progress?: number;
  error?: string;
}

export interface DropzoneProps {
  onFiles?: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  /** Bytes. Files over this are rejected before `onFiles`. */
  maxSize?: number;
  files?: DropzoneFile[];
  onRemove?: (id: string) => void;
  hint?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/**
 * A real drop target: it counts drag depth, so dragging over a child element
 * does not flicker the highlight off — the bug in most hand-rolled dropzones.
 */
export function Dropzone({
  onFiles,
  accept,
  multiple = true,
  maxSize,
  files = [],
  onRemove,
  hint,
  disabled = false,
  className,
}: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);
  const id = useCordonId("drop");

  const take = useCallback(
    (list: FileList | null) => {
      if (!list) return;
      const picked = Array.from(list);
      const tooBig = maxSize ? picked.filter((file) => file.size > maxSize) : [];
      if (tooBig.length) {
        setRejected(`${tooBig[0].name} is larger than ${Math.round(maxSize! / 1024 / 1024)}MB`);
        return;
      }
      setRejected(null);
      onFiles?.(multiple ? picked : picked.slice(0, 1));
    },
    [onFiles, maxSize, multiple],
  );

  return (
    <div className={cx("cordon-dropzone-wrap", className)}>
      <div
        className={cx("cordon-dropzone", over && "cordon-dropzone--over", disabled && "cordon-dropzone--disabled")}
        onDragEnter={(event) => {
          event.preventDefault();
          depth.current += 1;
          setOver(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => {
          depth.current -= 1;
          if (depth.current <= 0) setOver(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          depth.current = 0;
          setOver(false);
          if (!disabled) take(event.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          id={id}
          type="file"
          className="cordon-visually-hidden"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={(event) => take(event.target.files)}
        />
        <motion.span
          className="cordon-dropzone__mark"
          animate={over ? { scale: 1.08, rotate: -4 } : { scale: 1, rotate: 0 }}
          transition={spring.snap}
          aria-hidden="true"
        >
          <Icon name="upload" />
        </motion.span>
        <p className="cordon-dropzone__title">
          {over ? "Drop to upload" : "Drag files here"}
        </p>
        <p className="cordon-dropzone__hint">{hint ?? (accept ? `${accept} · ` : "") }
          <button type="button" className="cordon-dropzone__browse" onClick={() => inputRef.current?.click()} disabled={disabled}>
            browse
          </button>
        </p>
        {rejected ? <p className="cordon-dropzone__error">{rejected}</p> : null}
      </div>

      {files.length ? (
        <ul className="cordon-dropzone__list">
          <AnimatePresence initial={false}>
            {files.map((entry) => (
              <motion.li
                key={entry.id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={spring.snap}
                className="cordon-dropzone__file"
              >
                <Icon name={entry.file.type.startsWith("image") ? "image" : "layers"} />
                <span className="cordon-dropzone__file-name">{entry.file.name}</span>
                {entry.progress !== undefined ? (
                  <span className="cordon-dropzone__file-bar">
                    <span style={{ width: `${entry.progress}%` }} />
                  </span>
                ) : entry.error ? (
                  <span className="cordon-dropzone__file-error">{entry.error}</span>
                ) : (
                  <Icon name="check-circle" className="cordon-dropzone__file-done" />
                )}
                {onRemove ? (
                  <button type="button" aria-label={`Remove ${entry.file.name}`} onClick={() => onRemove(entry.id)}>
                    <Icon name="close" />
                  </button>
                ) : null}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      ) : null}
    </div>
  );
}

/* ---- OTP ----------------------------------------------------------------- */

export interface OtpInputProps {
  length?: number;
  value?: string;
  onValueChange?: (value: string) => void;
  /** Fires once every box is filled. */
  onComplete?: (value: string) => void;
  /**
   * Sets each digit in the LED face. Off by default: the dot face is reserved
   * for a screen's hero figure, and six boxes of it is texture, not emphasis.
   */
  dots?: boolean;
  invalid?: boolean;
  label?: string;
  className?: string;
}

export function OtpInput({
  length = 6,
  value,
  onValueChange,
  onComplete,
  dots = false,
  invalid = false,
  label = "One-time code",
  className,
}: OtpInputProps) {
  const [internal, setInternal] = useState("");
  const current = (value ?? internal).slice(0, length);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const commit = (next: string) => {
    if (value === undefined) setInternal(next);
    onValueChange?.(next);
    if (next.length === length) onComplete?.(next);
  };

  const setAt = (index: number, char: string) => {
    const chars = current.split("");
    chars[index] = char;
    const next = chars.join("").slice(0, length);
    commit(next);
    if (char && index < length - 1) refs.current[index + 1]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key === "Backspace" && !current[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
    if (event.key === "ArrowLeft" && index > 0) refs.current[index - 1]?.focus();
    if (event.key === "ArrowRight" && index < length - 1) refs.current[index + 1]?.focus();
  };

  /* Paste fills every box at once — the thing people actually do with codes. */
  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    commit(pasted);
    refs.current[Math.min(pasted.length, length - 1)]?.focus();
  };

  return (
    <div className={cx("cordon-otp", invalid && "cordon-otp--invalid", className)} role="group" aria-label={label}>
      {Array.from({ length }, (_, index) => (
        <span key={index} className={cx("cordon-otp__box", current[index] && "cordon-otp__box--filled")}>
          {dots && current[index] ? (
            <DotText inline radius={1.75} className="cordon-otp__dots" aria-hidden="true">
              {current[index]}
            </DotText>
          ) : null}
          <input
            ref={(node) => { refs.current[index] = node; }}
            className="cordon-otp__input"
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            maxLength={1}
            aria-label={`Digit ${index + 1}`}
            value={current[index] ?? ""}
            data-dots={dots ? "" : undefined}
            onChange={(event) => setAt(index, event.target.value.replace(/\D/g, "").slice(-1))}
            onKeyDown={(event) => onKeyDown(event, index)}
            onPaste={onPaste}
          />
        </span>
      ))}
    </div>
  );
}

/* ---- Resizable ----------------------------------------------------------- */

export interface ResizableProps {
  start: ReactNode;
  end: ReactNode;
  /** Initial split, 0–1. */
  defaultSplit?: number;
  min?: number;
  max?: number;
  className?: string;
}

/** Two panes and a handle. Keyboard-operable, which most implementations skip. */
export function Resizable({ start, end, defaultSplit = 0.5, min = 0.2, max = 0.8, className }: ResizableProps) {
  const [split, setSplit] = useState(defaultSplit);
  const rootRef = useRef<HTMLDivElement>(null);

  const move = (clientX: number) => {
    const box = rootRef.current?.getBoundingClientRect();
    if (!box) return;
    setSplit(Math.min(max, Math.max(min, (clientX - box.left) / box.width)));
  };

  return (
    <div ref={rootRef} className={cx("cordon-resizable", className)} style={{ "--cordon-split": `${split * 100}%` } as React.CSSProperties}>
      <div className="cordon-resizable__pane">{start}</div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={Math.round(split * 100)}
        aria-valuemin={Math.round(min * 100)}
        aria-valuemax={Math.round(max * 100)}
        tabIndex={0}
        className="cordon-resizable__handle"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          const onMove = (e: PointerEvent) => move(e.clientX);
          const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
          };
          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") setSplit((s) => Math.max(min, s - 0.02));
          if (event.key === "ArrowRight") setSplit((s) => Math.min(max, s + 0.02));
        }}
      >
        <span className="cordon-resizable__grip" />
      </div>
      <div className="cordon-resizable__pane">{end}</div>
    </div>
  );
}
