import { useEffect } from "react";
import { Hero } from "../sections/Hero";
import { Claim } from "../sections/Claim";
import { Gap } from "../sections/Gap";
import { Counterfactual } from "../sections/Counterfactual";
import { Mechanism } from "../sections/Mechanism";
import { Arc } from "../sections/Arc";
import { Record } from "../sections/Record";
import { Start } from "../sections/Start";

/**
 * The whole site, in one scroll.
 *
 * Mechanism, Arc, Record and Start used to be four routes behind a landing
 * page whose middle third was a set of doors to them — three cards whose only
 * content was a summary of the page they linked to. Reading the site meant
 * five loads and four summaries of things not yet read. Now the doors are
 * gone, the four pages are the four sections they were always describing, and
 * the nav scrolls rather than navigates.
 *
 * Two things about this order. `Gap` answers "isn't this just a spend limit?",
 * so it sits where that question is actually being asked — right after the
 * claim — and not at the end, where it read as a footnote to a reader already
 * convinced. And the mandate's three numbers used to sit between the
 * counterfactual and the mechanism: $100, $5 and a depth of 3, which are demo
 * fixtures rather than product facts, arguing nothing the drawing above had
 * not shown and the section below did not name again with its enforcing
 * function attached.
 */
export default function Landing() {
  useEffect(() => {
    document.title = "Cordon — one budget for a tree of agents";
  }, []);

  return (
    <>
      <Hero />
      <Claim />
      <Gap />
      <Counterfactual />
      <Mechanism />
      <Arc />
      <Record />
      <Start />
    </>
  );
}
