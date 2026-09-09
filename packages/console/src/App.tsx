import { useEffect, useLayoutEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { CordonProvider, ToastProvider } from "cordon-ui";
import { WalletProvider } from "./lib/wallet";
import { useEntranceFailsafe } from "./lib/entrance";
import { ConsoleShell } from "./parts/Shell";
import Setup from "./screens/Setup";
import Tree from "./screens/Tree";
import Refusals from "./screens/Refusals";
import Drill from "./screens/Drill";
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
 * The console is the owner surface, and only that.
 *
 * Everything public — the argument, the conduct record, the drill — is
 * `@cordon/site`. What is left here is the two things that need the owner's
 * own key, so the root opens the console rather than restating a landing page
 * that already exists.
 */
export function App() {
  useEntranceFailsafe();

  return (
    <CordonProvider glaze="violet">
      {/* Bottom right, because the actions that raise one are taken in the
          right-hand column of every screen and a toast that appears across the
          page from the click is read as unrelated to it. */}
      <ToastProvider placement="bottom-right">
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

            <Route path="*" element={<NotFound />} />
          </Routes>
        </WalletProvider>
      </ToastProvider>
    </CordonProvider>
  );
}
