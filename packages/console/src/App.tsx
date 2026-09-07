import { useEffect, useLayoutEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { CordonProvider } from "cordon-ui";
import { WalletProvider } from "./lib/wallet";
import { useEntranceFailsafe } from "./lib/entrance";
import { ConsoleShell } from "./parts/Shell";
import Setup from "./screens/Setup";
import Tree from "./screens/Tree";
import Refusals from "./screens/Refusals";
import Drill from "./screens/Drill";
import AgentRecord from "./pages/AgentRecord";
import PublicDrill from "./pages/PublicDrill";
import Attest from "./pages/Attest";
import NotFound from "./pages/NotFound";

/**
 * `useLayoutEffect`, and the scroll has to be instant: `useEffect` runs after
 * paint, so a new screen gets one frame at the previous screen's offset, and a
 * smooth scroll is an animation that needs a frame loop it may not get.
 */
function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  }, []);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);

  return null;
}

/**
 * The console is the owner surface and the public record; it is not where the
 * argument is made. That is `@cordon/site`, so the root here opens the console
 * rather than restating a landing page that already exists.
 */
export function App() {
  useEntranceFailsafe();

  return (
    <CordonProvider glaze="violet">
      <WalletProvider>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<Navigate to="/console/setup" replace />} />

          <Route path="/console" element={<ConsoleShell />}>
            <Route index element={<Navigate to="/console/setup" replace />} />
            <Route path="setup" element={<Setup />} />
            <Route path="tree" element={<Tree />} />
            <Route path="refusals" element={<Refusals />} />
            <Route path="drill" element={<Drill />} />
          </Route>

          {/* Public, and deliberately outside the gate: a record nobody but its
              owner can read is not a record. */}
          <Route path="/agent/:id" element={<AgentRecord />} />
          <Route path="/drill" element={<PublicDrill />} />
          <Route path="/attest/:id" element={<Attest />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </WalletProvider>
    </CordonProvider>
  );
}
