import { Button, Surface, Tag } from "cordon-ui";
import { CONSOLE_URL } from "../parts/links";
import { ABSENT_TOOLS, ARC, MCP_CONFIG, MCP_TOOLS } from "@cordon/fixtures";
import { Reveal } from "../parts/Reveal";

/* Generated from the environment the daemon actually reads. This was written
   by hand until 8 September 2026, and named one variable that no code has ever
   looked at — a block a reader could copy and watch do nothing. */
const CONFIG = MCP_CONFIG;

/**
 * The page's one call to action. It used to be two — a Start page and a
 * closing panel underneath it that made the same offer in the same words —
 * and the reader was asked to begin twice.
 */
export function Start() {
  return (
    <section id="start" className="section">
      <div className="wrap">
        <Reveal>
          <p className="eyebrow">Start</p>
          <h2 className="display display--page" style={{ maxWidth: "16ch" }}>
            An env var, <span className="display__dim">not a rewrite.</span>
          </h2>
          <p className="lede">
            Cordon's first surface is MCP. Point Claude Desktop at the daemon, give it a dollar,
            and the fence is in the path of everything it buys.
          </p>
        </Reveal>
      </div>

      <div className="wrap wrap--narrow">
        <Reveal delay={0.08}>
          <Surface glaze="bisque" radius="6" rim elevation="tile" className="panel" style={{ marginTop: "var(--cordon-space-8)" }}>
            <p className="panel__label">claude_desktop_config.json</p>
            <pre
              className="mono"
              style={{
                margin: "10px 0 0",
                padding: "var(--cordon-space-5)",
                overflowX: "auto",
                borderRadius: "var(--cordon-radius-4)",
                background: "rgba(34,34,34,.045)",
                color: "var(--cordon-ink)",
                lineHeight: 1.65,
              }}
            >
              {CONFIG}
            </pre>
          </Surface>
        </Reveal>
      </div>

      <div className="wrap">
        <Reveal>
          <p className="eyebrow" style={{ marginTop: "clamp(44px, 7vh, 88px)" }}>
            The tool list is part of the fence
          </p>
          <ul className="points points--3">
            {MCP_TOOLS.map((tool) => (
              <li key={tool.name} className="points__item">
                <span className="mono" style={{ color: "var(--cordon-accent)" }}>
                  {tool.name}({tool.args})
                </span>
                <p className="points__body">{tool.note}</p>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={0.08}>
          <Surface
            glaze="bisque"
            radius="6"
            rim
            elevation="tile"
            className="panel"
            style={{ marginTop: "var(--cordon-space-7)" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Tag tone="critical" size="sm">never</Tag>
              {/* Every one of these is asserted absent against the same server
                  the list above was read from. */}
              {ABSENT_TOOLS.map((name) => (
                <span
                  key={name}
                  className="mono"
                  style={{ color: "var(--cordon-critical)", textDecoration: "line-through" }}
                >
                  {name}
                </span>
              ))}
            </div>
            <p className="panel__note">
              The agent cannot express “send money to X” — only “fetch this URL”. The moment a
              general transfer tool exists, the claim leaks.
            </p>
          </Surface>
        </Reveal>

        <Reveal delay={0.12}>
          <Surface glaze="violet" radius="6" elevation="tile" glow className="cta" style={{ marginTop: "clamp(48px, 8vh, 96px)" }}>
            <h2 className="display display--page" style={{ color: "#fff" }}>
              Sixty seconds,
              <br />
              <span style={{ color: "rgba(255,255,255,.52)" }}>on your own machine.</span>
            </h2>
            <p className="lede" style={{ marginInline: "auto", color: "var(--cordon-on-glaze-soft)" }}>
              Watch the refusal land on Arc {ARC.chainId}, in a block you can open yourself.
            </p>
            <div className="cta__actions">
              <a href={CONSOLE_URL}>
                <Button variant="primary" size="lg" magnetic>
                  Open the console
                </Button>
              </a>
              <a href={ARC.explorer} target="_blank" rel="noreferrer">
                <Button variant="secondary" size="lg" magnetic iconEnd="external">
                  Arc explorer
                </Button>
              </a>
            </div>
          </Surface>
        </Reveal>
      </div>
    </section>
  );
}
