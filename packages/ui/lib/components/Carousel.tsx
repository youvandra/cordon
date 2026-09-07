import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { cx } from "../cx";

/* Glossary: "Carousel / image carousel". */

export interface CarouselProps {
  children: ReactNode[];
  /** Slides visible at once at the widest size. */
  perView?: number;
  /** Advances on its own every N ms. Pauses on hover and on focus. */
  autoplay?: number;
  /** Wraps around at the ends. */
  loop?: boolean;
  showArrows?: boolean;
  showDots?: boolean;
  label?: string;
  className?: string;
}

/**
 * Scroll-snap based, so a trackpad, a thumb and the arrow buttons all drive
 * the same mechanism and the DOM order stays honest for screen readers.
 */
export function Carousel({
  children,
  perView = 1,
  autoplay,
  loop = true,
  showArrows = true,
  showDots = true,
  label = "Carousel",
  className,
}: CarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = children.length;
  const pages = Math.max(1, Math.ceil(count / perView));

  const goTo = useCallback(
    (page: number) => {
      const track = trackRef.current;
      if (!track) return;
      const target = loop ? (page + pages) % pages : Math.min(pages - 1, Math.max(0, page));
      track.scrollTo({ left: target * track.clientWidth, behavior: "smooth" });
      setActive(target);
    },
    [loop, pages],
  );

  useEffect(() => {
    if (!autoplay || paused) return;
    const timer = window.setInterval(() => goTo(active + 1), autoplay);
    return () => window.clearInterval(timer);
  }, [autoplay, paused, active, goTo]);

  const onScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    setActive(Math.round(track.scrollLeft / track.clientWidth));
  };

  return (
    <section
      className={cx("cordon-carousel", className)}
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div
        ref={trackRef}
        className="cordon-carousel__track"
        style={{ "--cordon-carousel-per-view": perView } as React.CSSProperties}
        onScroll={onScroll}
      >
        {children.map((child, index) => (
          <div
            key={index}
            className="cordon-carousel__slide"
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${count}`}
          >
            {child}
          </div>
        ))}
      </div>

      {showArrows && pages > 1 ? (
        <>
          <button
            type="button"
            className="cordon-carousel__arrow cordon-carousel__arrow--prev"
            aria-label="Previous slide"
            disabled={!loop && active === 0}
            onClick={() => goTo(active - 1)}
          >
            <Icon name="chevron-left" />
          </button>
          <button
            type="button"
            className="cordon-carousel__arrow cordon-carousel__arrow--next"
            aria-label="Next slide"
            disabled={!loop && active === pages - 1}
            onClick={() => goTo(active + 1)}
          >
            <Icon name="chevron-right" />
          </button>
        </>
      ) : null}

      {showDots && pages > 1 ? (
        <div className="cordon-carousel__dots">
          {Array.from({ length: pages }, (_, index) => (
            <button
              key={index}
              type="button"
              className={cx("cordon-carousel__dot", index === active && "cordon-carousel__dot--active")}
              aria-label={`Go to slide ${index + 1}`}
              aria-current={index === active || undefined}
              onClick={() => goTo(index)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
