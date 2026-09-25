import { useEffect, useLayoutEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { CordonProvider, ToastProvider } from "cordon-ui";
import { WalletProvider } from "./lib/wallet";
import { useEntranceFailsafe } from "./lib/entrance";
import { site } from "./lib/links";
import { ConsoleShell } from "./parts/Shell";
import Overview from "./screens/Overview";
import Agents from "./screens/Agents";
import Refusals from "./screens/Refusals";
import Resolve from "./screens/Resolve";
import NewMandate from "./screens/NewMandate";
import NotFound from "./pages/NotFound";

/** Instant, before paint: a smooth scroll needs a frame loop it may not get. */
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
 * An old address, kept working. `npm run init` prints
 * `/console/setup?operator=0x…`, and docs link `/console/tree` — so the query
 * string has to survive the move, or the operator a reader was handed is lost.
 */
function Moved({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
}

/** The drill is public evidence, and it lives on the site. */
function ToSite({ path }: { path: string }) {
  useEffect(() => {
    window.location.replace(site(path));
  }, [path]);
  return null;
}

export function App() {
  useEntranceFailsafe();

  return (
    <CordonProvider glaze="violet">
      <ToastProvider placement="bottom-right">
        <WalletProvider>
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<Navigate to="/console" replace />} />
            <Route path="/console" element={<ConsoleShell />}>
              <Route index element={<Overview />} />
              <Route path="agents" element={<Agents />} />
              <Route path="refusals" element={<Refusals />} />
              <Route path="resolve" element={<Resolve />} />
              <Route path="new" element={<NewMandate />} />
              <Route path="setup" element={<Moved to="/console/new" />} />
              <Route path="tree" element={<Moved to="/console/agents" />} />
              <Route path="drill" element={<ToSite path="/drill" />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </WalletProvider>
      </ToastProvider>
    </CordonProvider>
  );
}
