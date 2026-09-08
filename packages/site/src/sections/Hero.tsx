import { Button } from "cordon-ui";
import { DelegationTree } from "../parts/DelegationTree";
import { Appear } from "../parts/motion";

/**
 * The figure runs uncordoned, and that is deliberate.
 *
 * It used to run cordoned and refuse, which meant the reader had already
 * watched a refusal, alone and perfectly visible, two screens before the
 * counterfactual explained that a refusal is invisible. The hero was
 * undercutting the section built to make the point.
 *
 * So the hero draws the problem the lede beside it describes: every child
 * obeying its own limit while the root drains past a bound nobody is holding.
 *
 * The drawing sits on the page rather than inside a card. A panel around it
 * turns the mechanism into an illustration of a product screenshot; on the
 * open background it reads as the thing itself.
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
              for a tree <span className="display__dim">of agents.</span>
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
          <p className="hero__caption">Without a cordon, every local check passes</p>
          <DelegationTree cordoned={false} height={300} interval={0.6} />
        </Appear>
      </div>
    </section>
  );
}
