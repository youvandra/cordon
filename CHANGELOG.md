# Changelog

## 0.2.0 — unreleased

Built at **ETHGlobal Tokyo 2026** (25–27 September), on the **Continuity track /
Extend Open Source**. Everything in this section was written during the event.

The boundary is a tag, so it can be checked rather than taken on trust:

```
git log v0.1.0..HEAD      # the work done at Tokyo
git diff v0.1.0..HEAD     # and the whole of it
```

`v0.1.0` is the last commit that predates the event. The first commit made
during it is `8aa6e22`.

### Added

- `LocalGateway`, a settlement rail for chains without Circle's Gateway.
  `TreeVault` reaches its gateway through `IGatewayWallet`, so the chain is
  served by satisfying that interface. No existing contract changed.
- `SEPOLIA` and `ENSV2` fixtures, beside `ARC` and replacing nothing. Arc stays
  deployed and stays reachable.
- `DirectSettler`, which settles an x402 purchase against the operator's own
  token balance. It has no fee floor, so purchases below Circle's
  `GATEWAY.baseFee6` settle for the first time.

### Reused, unchanged

The mandate tree, the vault's enforcement, the conduct record, the daemon, the
MCP server and the console all predate the event. What the weekend adds sits
beside them.

## 0.1.0 — 2026-09-16

Built for ETHOnline 2026. Mandate registry, tree vault, conduct record, daemon,
MCP server, console, meter and attest seller, deployed on Arc testnet.
