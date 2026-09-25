import { useEffect } from "react";
import { Hero } from "../sections/Hero";
import { Stack } from "../sections/Stack";
import { Claim } from "../sections/Claim";
import { Counterfactual } from "../sections/Counterfactual";
import { Purchase } from "../sections/Purchase";
import { Arc } from "../sections/Arc";
import { Record } from "../sections/Record";
import { Names } from "../sections/Names";
import { Start } from "../sections/Start";

/**
 * The whole site, in one scroll.
 *
 * Two sections have gone. One quoted a paper listing what the agent protocols
 * cannot express, which read as a tour of everything missing rather than of
 * what is here. The other listed the four checks in prose, immediately under
 * the two drawings that had just shown them run. The checks now sit beside
 * those drawings, in four lines.
 */
export default function Landing() {
  useEffect(() => {
    document.title = "Cordon · one budget for a tree of agents";
  }, []);

  return (
    <>
      <Hero />
      <Stack />
      <Claim />
      <Counterfactual />
      <Purchase />
      <Arc />
      <Record />
      <Names />
      <Start />
    </>
  );
}
