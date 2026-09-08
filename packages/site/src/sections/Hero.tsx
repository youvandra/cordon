import { Button } from "cordon-ui";
import { Allowances } from "../parts/Allowances";
import { Appear } from "../parts/motion";

/**
 * The figure is the arithmetic, not the tree.
 *
 * The delegation tree runs twice in the counterfactual, two screens down,
 * where the reader has been given a reason to read it. Drawing it here as well
 * spent the hero on a picture that only pays off later, so the hero now shows
 * the part that needs no narration: two limits, each respected, together
 * permitting more than the root holds.
 *
 * The figure sits on the page rather than inside a card. A panel around it
 * turns the mechanism into an illustration of a product screenshot; on the
 * open background it reads as the thing itself.
 *
 * It carries four labels and no caption. The labels are the figures the bars
 * are drawn from; a caption would be the lede two lines up, said twice on one
 * screen.
 */
export function Hero() {
  return (
    <section className="hero">
      <div className="hero__bg" />
      <div className="wrap hero__grid">
        <div>
          <Appear as="p" className="eyebrow" from={{ opacity: 0, y: 6 }} delay={0.05}>
            Arc · Circle
          </Appear>

          <h1 className="display">
            <Appear
              as="span"
              className="display__line"
              from={{ opacity: 0, y: "0.4em", clipPath: "inset(0 0 56% 0)" }}
              transition={{ duration: 0.84, ease: [0.16, 1, 0.3, 1] }}
              delay={0.08}
            >
              One budget
            </Appear>
            <Appear
              as="span"
              className="display__line"
              from={{ opacity: 0, y: "0.4em", clipPath: "inset(0 0 56% 0)" }}
              transition={{ duration: 0.84, ease: [0.16, 1, 0.3, 1] }}
              delay={0.17}
            >
              for a tree
            </Appear>
            {/* Its own line. Left to wrap, "of agents." broke after "of" at
                most widths, which hung a preposition on the end of a display
                line and left the noun stranded on the next one. */}
            <Appear
              as="span"
              className="display__line display__dim"
              from={{ opacity: 0, y: "0.4em", clipPath: "inset(0 0 56% 0)" }}
              transition={{ duration: 0.84, ease: [0.16, 1, 0.3, 1] }}
              delay={0.26}
            >
              of agents.
            </Appear>
          </h1>

          <Appear
            as="p"
            className="lede"
            from={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
            delay={0.3}
          >
            An agent that spawns agents has no budget. Every child obeys its own
            limit, every limit is respected, and nobody adds them up.
          </Appear>

          <Appear className="hero__actions" from={{ opacity: 0, y: 8 }} delay={0.44}>
            <a href="#how">
              <Button variant="primary" size="lg" magnetic iconEnd="arrow-right">
                See it run
              </Button>
            </a>
            <a href="#start">
              <Button variant="ghost" size="lg">
                Run it yourself
              </Button>
            </a>
          </Appear>
        </div>

        <Appear className="hero__figure" from={{ opacity: 0, y: 16 }} delay={0.42}>
          <Allowances />
        </Appear>
      </div>
    </section>
  );
}
