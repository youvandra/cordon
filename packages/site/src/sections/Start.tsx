import { Link } from "react-router-dom";
import { Button, Surface } from "cordon-ui";
import { MCP_CONFIG } from "@cordon/fixtures";
import { CONSOLE_URL } from "../parts/links";
import { Reveal } from "../parts/Reveal";

/* Generated from the environment the daemon actually reads, so the block a
   reader copies is the block the daemon answers to. */
const CONFIG = MCP_CONFIG;

/**
 * The page's one call to action.
 *
 * The list of MCP tools that used to sit here belongs in the docs. On the
 * landing page it asked a reader who had not yet run anything to study an API.
 */
export function Start() {
  return (
    <section id="start" className="section">
      <div className="wrap">
        <Reveal>
          <p className="eyebrow">Start</p>
          <h2 className="display display--page" style={{ maxWidth: "16ch" }}>
            One env var, <span className="display__dim">not a rewrite.</span>
          </h2>
          <p className="lede">
            Point Claude Desktop at the daemon, give it a dollar, and the fence
            is in the path of everything it buys.
          </p>
        </Reveal>
      </div>

      <div className="wrap wrap--narrow">
        <Reveal delay={0.08}>
          <Surface glaze="bisque" radius="6" rim elevation="tile" className="panel" style={{ marginTop: "var(--cordon-space-8)" }}>
            <p className="panel__label">claude_desktop_config.json</p>
            <pre className="code mono">{CONFIG}</pre>
            <p className="panel__note">
              Everything else the daemon can do, and how to put it in front of a
              script instead, is in <Link to="/docs">the docs</Link>.
            </p>
          </Surface>
        </Reveal>
      </div>

      <div className="wrap">
        <Reveal delay={0.12}>
          <Surface glaze="violet" radius="6" elevation="tile" glow className="cta" style={{ marginTop: "clamp(48px, 8vh, 96px)" }}>
            <h2 className="display display--page" style={{ color: "#fff" }}>
              Sixty seconds,
              <br />
              <span style={{ color: "rgba(255,255,255,.52)" }}>on your own machine.</span>
            </h2>
            <p className="lede" style={{ marginInline: "auto", color: "var(--cordon-on-glaze-soft)" }}>
              Watch the refusal land on Arc, in a block you can open yourself.
            </p>
            <div className="cta__actions">
              <a href={CONSOLE_URL}>
                <Button variant="primary" size="lg" magnetic>
                  Open the console
                </Button>
              </a>
              <Link to="/docs">
                <Button variant="secondary" size="lg" magnetic iconEnd="arrow-right">
                  Read the docs
                </Button>
              </Link>
            </div>
          </Surface>
        </Reveal>
      </div>
    </section>
  );
}
