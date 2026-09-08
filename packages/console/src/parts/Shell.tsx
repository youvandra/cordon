import { useEffect } from "react";
import type { ReactNode } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Button,
  DropdownButton,
  Icon,
  Logo,
  Sidebar,
  Surface,
  Tag,
  Text,
  useNoIndex,
} from "cordon-ui";
import { ARC, ENFORCED_BY } from "@cordon/fixtures";
import { useWallet } from "../lib/wallet";
import { site } from "../lib/links";
import { SCREENS } from "./screens";

export { SCREENS };

export function useTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

/**
 * The bar takes its material from the docs shell — 56px, paper at 72% under
 * the same blur, the same hairline — and almost nothing else.
 *
 * It carried a 380px search box, a density switcher, a chain badge and the
 * name of the screen you were already looking at, which the sidebar was
 * highlighting and the screen's own heading was stating. A bar is not a place
 * to prove the design system has parts. What is left is the product's name and
 * who is signed in.
 */
function Topbar({ children }: { children?: ReactNode }) {
  return (
    /* Named, because a page carries two of these — the site's banner and the
       page's own header — and a screen reader listing "banner, banner" is no
       more use than listing nothing. */
    <header className="top" aria-label="Cordon">
      <Link to="/" className="top__brand" aria-label="Cordon console">
        <Logo size={19} />
        <Text variant="micro" tone="dim" as="span" className="top__mark">
          console
        </Text>
      </Link>
      <span className="top__spacer" />
      <div className="top__end">{children}</div>
    </header>
  );
}

/**
 * The owner surface.
 *
 * The gate is the argument, not a formality: the two things this console can
 * do that nothing else in the system can — signing a mandate and releasing a
 * refusal — both require the owner's own key.
 */
export function ConsoleShell() {
  useTitle("Console — Cordon");
  /* The owner surface is not a page anyone should reach from a search result. */
  useNoIndex(true);
  const { address, connect, disconnect } = useWallet();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  if (!address) {
    return (
      <div className="shell">
        <Topbar />
        <main id="content" className="gate">
          <Surface
            glaze="violet"
            radius="6"
            elevation="tile"
            glow
            grain
            sheen
            className="gate__panel"
          >
            <Text variant="micro" tone="on-glaze" as="p" className="eyebrow">
              owner surface · wallet required
            </Text>
            <h1 className="gate__title">This half of the system is human.</h1>
            <Text variant="body" tone="on-glaze" as="p" className="gate__copy">
              Creating a mandate and releasing a refusal both require a
              signature from the owner's own key. Neither our server nor the
              agent can produce one. That is the point of the wallet gate, not a
              formality.
            </Text>
            <div className="gate__actions">
              <Button variant="secondary" size="lg" magnetic onClick={connect}>
                Connect wallet
              </Button>
              <a href={site("/agent/41827")}>
                <Button variant="glaze" size="lg">
                  See a public record
                </Button>
              </a>
            </div>
            <div className="gate__foot">
              <Tag tone="caution" size="sm" dot>
                mock connection — no wallet is touched
              </Tag>
              <span className="mono gate__fn">{ENFORCED_BY.release}</span>
            </div>
          </Surface>
        </main>
      </div>
    );
  }

  const index = Math.max(
    0,
    SCREENS.findIndex((screen) => pathname.startsWith(`/console/${screen.id}`)),
  );

  return (
    /* Compact, and not a control. The docs offer a density switcher because
       trying all three is the point there; a product picks one. */
    <div className="shell" data-cordon-density="compact">
      <a className="skip" href="#content">
        Skip to content
      </a>
      <Topbar>
        {/* Not the chain id badge that was here — that number is printed by
            every explorer link on the page. Which network the money is on is
            different: it is the one piece of state in this bar that changes
            what a click costs. */}
        <Tag tone={ARC.mainnetLaunched ? "positive" : "caution"} size="sm" dot>
          {ARC.mainnetLaunched ? "mainnet" : "testnet"}
        </Tag>
        <DropdownButton
          variant="ghost"
          size="sm"
          menuWidth={240}
          align="end"
          items={[
            {
              id: "copy",
              label: "Copy address",
              icon: "copy",
              onSelect: () => navigator.clipboard?.writeText(address),
            },
            {
              id: "explorer",
              label: "View on arcscan",
              icon: "external",
              onSelect: () =>
                window.open(`${ARC.explorer}/address/${address}`, "_blank"),
            },
            {
              id: "disconnect",
              label: "Disconnect",
              icon: "close",
              destructive: true,
              onSelect: disconnect,
            },
          ]}
        >
          {/* Not an Avatar: it derives initials by splitting on whitespace, so
              an address becomes the single character "0". An address has no
              initials, and inventing one is worse than a glyph. */}
          <Icon name="user" size={14} />
          <span className="mono top__addr">
            {address.slice(0, 6)}…{address.slice(-4)}
          </span>
        </DropdownButton>
      </Topbar>

      <div className="console">
        <Sidebar
          className="console__side"
          value={SCREENS[index].id}
          onValueChange={(id) => navigate(`/console/${id}`)}
          sections={[
            {
              title: "Four screens",
              items: SCREENS.map((s) => ({ id: s.id, label: s.label })),
            },
          ]}
        />
        {/* No progress rail here. The four screens are navigation, not a
            sequence — you go to Tree, then Refusals, then back to Tree — and a
            rail claiming "step 2 of 4" is asserting a journey nobody is on.
            The device is right for Setup's own steps, not for the shell. */}
        <main id="content" className="console__main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
