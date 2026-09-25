import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Button, DropdownButton, Logo, Tag, useNoIndex, useNotify } from "cordon-ui";
import { ARC, SEPOLIA, shortAddress } from "@cordon/fixtures";
import { useWallet } from "../lib/wallet";

export function useTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

const NAV = [
  { to: "/console", label: "Overview", end: true },
  { to: "/console/agents", label: "Agents", end: false },
  { to: "/console/refusals", label: "Refusals", end: false },
  { to: "/console/resolve", label: "Resolve", end: false },
];

function Account() {
  const { address, real, ready, available, connect, disconnect } = useWallet();
  const notify = useNotify();

  if (!ready) return <span className="bar__placeholder" aria-hidden="true" />;

  if (real && address) {
    return (
      <DropdownButton
        variant="secondary"
        size="sm"
        align="end"
        items={[
          {
            id: "copy",
            label: "Copy address",
            icon: "copy",
            onSelect: () => {
              void navigator.clipboard?.writeText(address);
              notify({ id: "copied", tone: "positive", title: "Address copied", children: shortAddress(address), duration: 2500 });
            },
          },
          {
            id: "explorer",
            label: "View on arcscan",
            icon: "external",
            onSelect: () => window.open(`${ARC.explorer}/address/${address}`, "_blank", "noreferrer"),
          },
          "separator",
          { id: "disconnect", label: "Disconnect", icon: "close", destructive: true, onSelect: disconnect },
        ]}
      >
        <span className="mono">{shortAddress(address, 6, 4)}</span>
      </DropdownButton>
    );
  }

  if (available) {
    return (
      <Button variant="primary" size="sm" onClick={connect}>
        Connect wallet
      </Button>
    );
  }

  return <Tag size="sm">Read-only</Tag>;
}

/**
 * One bar, three destinations, and who is signed in.
 *
 * No gate in front of the console: somebody without a wallet lands on the
 * public tree and can read all of it, and connecting is one button in the
 * corner rather than a card they have to get past first.
 */
export function ConsoleShell() {
  useTitle("Cordon console");
  useNoIndex(true);
  const { address, real, ready, available, connect } = useWallet();
  const mine = real && Boolean(address);
  /**
   * Which chain the screen in front of the reader is actually reading.
   *
   * Cordon runs on both, and Resolve reads Sepolia because that is the only
   * chain ENSv2 is deployed on while the rest of the console still answers for
   * the Arc tree. A bar naming one chain over a screen reading another is a
   * surface stating something untrue, which is the failure this project spends
   * most of its rules preventing.
   */
  const chain = useLocation().pathname.startsWith("/console/resolve") ? SEPOLIA : ARC;

  return (
    <div className="shell">
      <header className="bar">
        <div className="bar__inner">
          <Link to="/console" className="bar__brand" aria-label="Cordon console">
            <Logo size={18} />
            <span className="bar__product">Console</span>
          </Link>

          <nav className="bar__nav" aria-label="Console">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => (isActive ? "bar__link is-active" : "bar__link")}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="bar__end">
            <Tag size="sm" dot>
              {chain.name}
            </Tag>
            <Account />
          </div>
        </div>
      </header>

      {ready && !mine ? (
        <div className="notice" role="note">
          <div className="notice__inner">
            <span>
              You are viewing the public tree Cordon runs on {chain.name}. It is read-only.
            </span>
            {available ? (
              <button type="button" className="notice__action" onClick={connect}>
                Connect a wallet to manage your own →
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <main id="content" className="page">
        <Outlet />
      </main>
    </div>
  );
}
