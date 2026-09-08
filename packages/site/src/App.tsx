import { useEffect, useLayoutEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { CordonProvider } from "cordon-ui";
import { Shell } from "./parts/Shell";
import { SECTIONS } from "./parts/nav";
import { useEntranceFailsafe } from "./parts/motion";
import Landing from "./pages/Landing";
import Docs from "./docs/Docs";
import Drill from "./pages/Drill";
import AgentRecord from "./pages/AgentRecord";
import Attest from "./pages/Attest";
import NotFound from "./pages/NotFound";

/**
 * Put the new position at the top before it is painted.
 *
 * `useEffect` runs after paint, so the incoming view gets one frame at the
 * outgoing one's scroll offset. The navigation is a sticky-nav click, which
 * means that offset is usually thousands of pixels down — and if the new view
 * is shorter, the browser clamps the scroll and parks the reader in whatever
 * is at the bottom. It reads as a blank page that a reload "fixes", because a
 * reload starts at zero.
 *
 * `useLayoutEffect` runs before paint, and the scroll has to be instant: a
 * smooth scroll is an animation, and an animation needs a frame loop it may
 * not get.
 *
 * A hash is an instruction to land somewhere other than the top, so it wins.
 * The late retry is for the hash arriving with the page — the target's offset
 * moves as charts above it take their measured height.
 */
function ScrollManager() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  }, []);

  useLayoutEffect(() => {
    const target = hash ? document.querySelector(hash) : null;

    if (!target) {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
      return;
    }

    const land = () =>
      document
        .querySelector(hash)
        ?.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "start" });

    land();
    const settle = window.setTimeout(land, 120);
    return () => window.clearTimeout(settle);
  }, [pathname, hash]);

  return null;
}

export function App() {
  useEntranceFailsafe();

  return (
    <CordonProvider glaze="rose">
      <ScrollManager />
      {/* The landing's shell carries a section nav, so it belongs to the
          landing rather than to the site. The record pages bring their own
          frame; nesting them inside this one gave the page two mastheads. */}
      <Routes>
        <Route
          path="/"
          element={
            <Shell>
              <Landing />
            </Shell>
          }
        />

        {/* The four pages this site used to be. Anything already linking to
            them — the brief, the README — lands on the section instead of a
            404. */}
        {SECTIONS.map((section) => (
          <Route
            key={section.id}
            path={`/${section.id}`}
            element={<Navigate to={{ pathname: "/", hash: `#${section.id}` }} replace />}
          />
        ))}

        {/* The public record. It lives here rather than in the console
            because none of it is gated, and because /agent/<id> is the one
            surface built to be shared — a seller reads it before serving, an
            underwriter before pricing. */}
        {/* The documentation. Its own frame: a contents list, a page, and the
            headings of that page, which is a different room from the landing's
            one long scroll. */}
        <Route path="/docs" element={<Navigate to="/docs/introduction" replace />} />
        <Route path="/docs/:slug" element={<Docs />} />

        <Route path="/drill" element={<Drill />} />
        <Route path="/agent/:id" element={<AgentRecord />} />
        <Route path="/attest/:id" element={<Attest />} />

        <Route
          path="*"
          element={
            <Shell>
              <NotFound />
            </Shell>
          }
        />
      </Routes>
    </CordonProvider>
  );
}
