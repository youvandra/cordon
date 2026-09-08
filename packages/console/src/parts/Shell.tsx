import { useEffect } from "react";
import type { ReactNode } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Button,
  DropdownButton,
  Icon,
  Logo,
  Surface,
  Tag,
  Text,
  useNoIndex,
} from "cordon-ui";
import { ARC, MANDATE, isAddress, shortAddress } from "@cordon/fixtures";
import { REFUSALS } from "@cordon/fixtures/preview";
import { useWallet } from "../lib/wallet";
import { site } from "../lib/links";
import { SCREENS, SCREEN_GROUPS } from "./screens";

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
  useTitle("Console · Cordon");
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
              Creating a mandate and releasing a refusal both need a signature
              from the owner's own key. Neither our server nor the agent can
              produce one, which is what the wallet gate is for.
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
                preview build, no wallet is touched
              </Tag>
            </div>
          </Surface>
        </main>
      </div>
    );
  }

  const standing = REFUSALS.filter((refusal) => !refusal.released).length;

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
          {/* No owner has signed a mandate yet, so the preview build has no
              address to show and says which of the two it is. */}
          <span className="mono top__addr">
            {isAddress(address) ? shortAddress(address, 6) : "preview session"}
          </span>
        </DropdownButton>
      </Topbar>

      <div className="console">
        <nav className="side" aria-label="Console">
          {/* The mandate this console is looking at. A sidebar that opens with
              navigation and never says which tree you are in is a sidebar for
              a product with one tree. */}
          <div className="side__head">
            <span className="side__head-label">Mandate</span>
            <span className="mono side__head-id">{shortAddress(MANDATE.id)}</span>
            <Tag tone={ARC.mainnetLaunched ? "positive" : "caution"} size="sm" dot>
              {ARC.mainnetLaunched ? "mainnet" : "testnet"}
            </Tag>
          </div>

          {SCREEN_GROUPS.map((group) => (
            <div key={group.title} className="side__group">
              <p className="side__group-title">{group.title}</p>
              <ul className="side__list">
                {group.screens.map((screen) => {
                  const active = pathname.startsWith(`/console/${screen.id}`);
                  return (
                    <li key={screen.id}>
                      <button
                        type="button"
                        className={`side__item${active ? " side__item--active" : ""}`}
                        aria-current={active ? "page" : undefined}
                        onClick={() => navigate(`/console/${screen.id}`)}
                      >
                        <Icon name={screen.icon} size={15} className="side__icon" />
                        <span className="side__text">
                          <span className="side__label">{screen.label}</span>
                          <span className="side__desc">{screen.description}</span>
                        </span>
                        {screen.id === "refusals" && standing > 0 ? (
                          <span className="side__count">{standing}</span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {/* Everything below this line leaves the console. Kept apart from
              the screens above, because a link that navigates away and one
              that changes the view are not the same kind of thing. */}
          <div className="side__group">
            <p className="side__group-title">Elsewhere</p>
            <ul className="side__list">
              <li>
                <a className="side__out" href={site("/agent/41827")}>
                  <Icon name="globe" size={14} />
                  Public record
                </a>
              </li>
              <li>
                <a className="side__out" href={site("/docs/introduction")}>
                  <Icon name="info" size={14} />
                  Docs
                </a>
              </li>
              <li>
                <a
                  className="side__out"
                  href={`${ARC.explorer}/address/${MANDATE.vault}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Icon name="external" size={14} />
                  Vault on arcscan
                </a>
              </li>
            </ul>
          </div>
        </nav>

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
