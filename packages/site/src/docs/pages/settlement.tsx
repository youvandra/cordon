import { Link } from "react-router-dom";
import { ARC, ATTEST, GATEWAY, MARKETPLACE, SETTLEMENT, formatUsdc } from "@cordon/fixtures";
import { C, Code, H2, H3, Lead, Note, OL, P, Table, UL } from "../parts";

const tx = (hash: string) => `${ARC.explorer}/tx/${hash}`;
const short = (hash: string) => `${hash.slice(0, 10)}…${hash.slice(-6)}`;

/**
 * The rail, and what it costs.
 *
 * Every other page can talk about a bound without saying how the money
 * actually moves. This one says it, including the two figures that decide what
 * Cordon can and cannot be used for: Circle's fee, and the floor it puts under
 * a purchase.
 */
export function Settlement() {
  return (
    <>
      <Lead>
        A bound is checked on chain and a payment is signed off it. Those are
        two different clocks, and keeping them apart is what lets Cordon refuse
        a purchase without slowing down the one it allows.
      </Lead>

      <H2 id="the-two-clocks">The two clocks</H2>
      <Table
        head={["", "The draw", "The payment"]}
        rows={[
          ["Where", "a transaction on Arc", "an off chain signature"],
          ["Who", "the vault, after checking every ancestor", "the operator key, to the seller's challenge"],
          ["Costs", "gas, cents on testnet", "nothing"],
          ["Cordon adds", "the whole check", "nothing at all"],
        ]}
      />
      <P>
        The fast path is not ours and we do not touch it. x402 batch settlement
        needs an EOA signature and does not support <C>ERC-1271</C>, so no
        contract can sit inside a single payment even if one wanted to. What
        Cordon bounds is the money that reaches the key doing the signing.
      </P>

      <H2 id="one-purchase">One purchase, as three transactions</H2>
      <P>
        This is a real one, read back off the chain on{" "}
        {SETTLEMENT.recordedAt.slice(0, 10)}: {formatUsdc(SETTLEMENT.price6)} to
        a seller, from a node whose operator held nothing beforehand.
      </P>
      <OL>
        <li>
          <b>The draw.</b> The vault checks every node from this one to the
          root, charges them all, and moves the tranche into this operator's own
          Gateway balance — nobody else's.{" "}
          <a href={tx(SETTLEMENT.drawTx)} target="_blank" rel="noreferrer">
            <C>{short(SETTLEMENT.drawTx)}</C>
          </a>
        </li>
        <li>
          <b>The mint.</b> Circle's Gateway lands the balance where the
          operator can spend it.{" "}
          <a href={tx(SETTLEMENT.mintTx)} target="_blank" rel="noreferrer">
            <C>{short(SETTLEMENT.mintTx)}</C>
          </a>
        </li>
        <li>
          <b>The collection.</b> The operator signs an EIP-3009 authorisation
          for exactly the price, and the seller collects it.{" "}
          <a href={tx(SETTLEMENT.collectTx)} target="_blank" rel="noreferrer">
            <C>{short(SETTLEMENT.collectTx)}</C>
          </a>
        </li>
      </OL>
      <Note tone="good" title="The order is the design">
        The bound is checked in step one, before the money exists. Everything
        after it is the payment the bound already allowed.
      </Note>
      <P>
        Between steps, what sits outside the contract is one tranche — the size
        of one purchase — and never a balance. An operator that stops here
        leaves a window debited and a seller unpaid, which is stated plainly in{" "}
        <Link to="/docs/introduction">what this does not claim</Link> rather
        than hidden behind a retry.
      </P>

      <H2 id="the-fee">The fee, and the floor under a purchase</H2>
      <P>
        Circle charges <b>{formatUsdc(GATEWAY.baseFee6)}</b> for a same-chain
        Gateway transfer on Arc, quoted by its own API, and it is charged{" "}
        <b>on top of</b> the value rather than taken out of it. A burn of{" "}
        {formatUsdc(GATEWAY.baseFee6 + 3_000n)} against a{" "}
        {formatUsdc(10_000n)} balance is accepted; a burn of{" "}
        {formatUsdc(10_000n)} against that same balance is refused, for{" "}
        {formatUsdc(13_500n)}.
      </P>
      <P>
        So a tranche can only pay for its own settlement when it is larger than
        the fee. That is the floor, and it is a fact about the rail rather than
        about Cordon: a payment of a tenth of a cent cannot settle here at all.
      </P>
      <Note tone="warn" title="The other rail is slower, not cheaper">
        <C>GatewayWallet.withdraw</C> avoids the fee and takes{" "}
        {GATEWAY.withdrawalDelaySeconds.toLocaleString()} seconds — fourteen
        days. Neither rail settles a payment smaller than the fee, so Cordon
        prices its own endpoint at {formatUsdc(ATTEST.price6)} rather than
        pretending otherwise.
      </Note>
      <P>
        For scale: of {MARKETPLACE.offersTotal.toLocaleString()} live offers in
        Circle's own x402 catalogue, {MARKETPLACE.offersAtOrBelowOneCent.toLocaleString()}{" "}
        are priced at a cent or below, and the median is ${MARKETPLACE.priceMedian}.
        Most of that catalogue is inside the band this floor sits in.
      </P>

      <H2 id="what-cannot-be-enforced">What the rail will not let us enforce</H2>
      <P>
        The seller is named in <C>{GATEWAY.sellerField}</C>, a field inside a
        burn intent that is signed off chain and handed to Circle's API. The
        Gateway contract never sees it, and no contract can.
      </P>
      <P>
        The consequence is precise, and Cordon states it rather than implying
        the stronger claim: a bound that names a counterparty —{" "}
        <b>concentration</b> above all — is enforced at the moment a balance is
        topped up, which is the draw, and cannot be enforced against money that
        is already sitting in a Gateway balance. Matching the declared payee
        against the paid one happens afterwards, in{" "}
        <Link to="/docs/meter#reconciliation">reconciliation</Link>.
      </P>
      <Note tone="info" title="Why the tranche is the size of the purchase">
        This is the reason the vault releases exactly one purchase at a time
        rather than a float. The smaller the balance that exists outside the
        contract, the less there is for that gap to matter to.
      </Note>

      <H2 id="the-numbers">The numbers, measured</H2>
      <Table
        head={["What", "Value", "How it is known"]}
        rows={[
          ["Gateway fee on Arc", formatUsdc(GATEWAY.baseFee6), "quoted by the API, and refused below it"],
          ["Gas for the mint", formatUsdc(GATEWAY.mintGas6), "measured on the settlement above"],
          ["Withdrawal delay", `${GATEWAY.withdrawalDelaySeconds.toLocaleString()}s`, "read from GatewayWallet"],
          ["Gateway API", GATEWAY.api, "answers with no credential"],
          ["Arc's Gateway domain", String(GATEWAY.domain), "from /v1/info"],
        ]}
      />
      <P>
        <C>GatewayMinter</C> is at <C>{GATEWAY.minter}</C> and{" "}
        <C>GatewayWallet</C> at <C>{GATEWAY.wallet}</C>, both on Arc testnet.
        Settlement was confirmed by doing it on {GATEWAY.settlementVerifiedOn},
        not by reading a guide.
      </P>

      <H3 id="one-open-question">One question still open</H3>
      <P>
        Circle's public Gateway guide documents no x402 endpoints, so the
        buyer-side transfer search the meter would use to match declared payees
        against settled ones is <C>{GATEWAY.searchX402Transfers}</C>. Until a
        key confirms it exists, reconciliation reports what it can read and says{" "}
        <C>unavailable</C> for the rest, rather than approximating it.
      </P>
    </>
  );
}

/**
 * The owner's own screens, described as controls rather than as features.
 *
 * Everything here costs a signature or costs nothing, and which of those it is
 * decides what the reader has to have ready before opening it.
 */
export function Console() {
  return (
    <>
      <Lead>
        The console is the half of Cordon a person uses. It signs nothing on
        your behalf and holds no key: every control that changes the chain opens
        your own wallet, and every figure on it is read from the contract that
        enforces it.
      </Lead>

      <H2 id="two-ways-in">Two ways in</H2>
      <Table
        head={["", "Preview", "Wallet"]}
        rows={[
          ["What it shows", "the public tree Cordon runs on Arc", "your own tree"],
          ["Signs", "nothing", "with your key, one action at a time"],
          ["Controls", "none are drawn", "fund, spawn, revoke, release"],
        ]}
      />
      <P>
        A preview session is not a demo of invented agents — it is the real tree
        on Arc, read the same way yours is. What it does not have is any control
        that would fail at a wallet you have not connected.
      </P>

      <H2 id="setup">Setup — sign the mandate</H2>
      <P>
        Six questions, then one signature. Budget and window, the total for the
        life of the mandate, the most a single purchase may be, the share of a
        window any one seller may take, and how deep the tree may go.
      </P>
      <Note tone="warn" title="It cannot be edited afterwards">
        A mandate narrows and never widens. What you sign here is the ceiling
        for everything that will ever hang under it, and raising it means a new
        mandate rather than an edit.
      </Note>

      <H2 id="tree">Tree — watch the exposure</H2>
      <UL>
        <li>
          <b>Root window</b>, with the funding control on it. Funding asks for
          two signatures: one approving the vault to move USDC, one moving it.
        </li>
        <li>
          <b>Agents under this mandate</b>, with the spawn control on it. The
          operator you name must not be your own wallet.
        </li>
        <li>
          <b>Every node, as figures</b> — what each may still draw, what it has
          spent this window and in total, and who signs for it. Revoking a node
          is in that row.
        </li>
        <li>
          <b>Open the tree</b> draws the whole thing, with every field the
          registry and the vault hold for whichever node you select.
        </li>
      </UL>
      <P>
        Every id in that table is derived from the owner's address rather than
        listed by a server, so the console can rebuild your tree from the chain
        alone. Nothing here is a reduction of events, which is why nothing here
        can disagree with the contract.
      </P>

      <H2 id="refusals">Refusals — decide, or leave it</H2>
      <P>
        Every decision the contract made, newest first, each naming the amount,
        the bound that stopped it and the transaction. As the owner you can{" "}
        <b>release</b> one: a signature that pays that single purchase past the
        bound, with the refusal and the release left side by side on the record.
      </P>
      <P>
        Releasing does not raise anything. The same purchase is refused again a
        second later, because the bound never moved.
      </P>

      <H2 id="drill">Drill — the measured ceiling</H2>
      <P>
        Evidence, not a control. One adversarial run of ours, published whichever
        way it came out, and the same numbers for every reader —{" "}
        <Link to="/docs/faq#what-is-the-drill">the FAQ says what it is</Link>.
      </P>

      <H2 id="what-it-needs">What the console needs to be up</H2>
      <P>
        Very little. The tree and the mandate are read from the chain directly.
        The refusals screen prefers the meter, and falls back to reading the
        chain in windows when the meter is not there — saying which part of the
        record it managed to read, rather than drawing a short list as a
        complete one.
      </P>
      <P>
        Spending does not involve the console at all. An agent behind the daemon
        keeps buying with every server we run switched off.
      </P>
    </>
  );
}

/**
 * The errors people actually hit, and what each one means.
 *
 * Written from the ones this project hit itself: the RPC's own range limit,
 * a daemon that refuses to start, an operator that is not the operator, and a
 * refusal somebody tried to retry.
 */
export function Troubleshooting() {
  return (
    <>
      <Lead>
        Most of these are the system telling the truth about something. The
        message is quoted as it arrives, so searching for it lands here.
      </Lead>

      <H2 id="refused-to-start">The daemon refuses to start</H2>
      <Code>{`cordon: no node configured; set CORDON_NODE_<label> and CORDON_KEY_<label>`}</Code>
      <P>
        It holds a key, so it checks every value once and exits rather than
        discovering a missing address halfway through a payment. Every variable
        it reads is on{" "}
        <Link to="/docs/configuration">Configuration</Link>.
      </P>

      <H2 id="wrong-node">A server speaking for the wrong node</H2>
      <P>
        A keyring holding several nodes has no natural first one. Name the node
        with <C>CORDON_MCP_NODE</C>; a node the process holds no key for is
        refused by name rather than silently falling back to another.
      </P>

      <H2 id="range-too-large">requested range too large</H2>
      <Code>{`{"code":-32012,"message":"requested range too large"}`}</Code>
      <P>
        Arc's public RPC caps how many blocks one <C>eth_getLogs</C> may span,
        and the cap differs between the nodes behind that name — one answers
        20,000 and refuses 50,000, another names 100,000 in its own error. Read
        in windows, and expect a <C>429</C> if you fire them in parallel.
      </P>
      <P>
        The meter exists for exactly this: it has read every block once, and
        serves the same data without every reader repeating the walk.
      </P>

      <H2 id="insufficient">The total cost of executing this transaction exceeds the balance</H2>
      <P>
        The operator has no gas. On Arc the gas token and the money are the same
        USDC, so an operator with a tranche and no gas cannot send the draw that
        would earn it. Fund the operator address, not the vault.
      </P>

      <H2 id="required-0135">required 0.0135 for a 0.01 purchase</H2>
      <P>
        Circle's Gateway fee is charged on top of the value, not taken out of
        it. A tranche the size of the purchase cannot also pay the fee — see{" "}
        <Link to="/docs/settlement#the-fee">the floor under a purchase</Link>.
      </P>

      <H2 id="refused-again">A refusal that comes back every time</H2>
      <P>
        That is the contract, and it is the answer rather than a failure.
        Retrying costs gas and lands another record on the agent; so does
        splitting the purchase, which is the behaviour the cumulative bounds
        exist to catch. Raise the bound with a new mandate, release that one
        purchase from the console, or fund the vault if the reason was{" "}
        <C>vault-balance</C>.
      </P>

      <H2 id="spawn-refused">A child the contract will not create</H2>
      <P>
        Children narrow on every axis, and <C>windowSeconds</C> must be{" "}
        <b>equal</b> to the parent's rather than smaller — a shorter child
        window refills faster than the window it debits, which is a hole rather
        than a tightening. Everything else may only go down.
      </P>

      <H2 id="nothing-published">Refusals enforced but not published</H2>
      <Code>{`record   none. Refusals are enforced and never published; set CORDON_RECORD`}</Code>
      <P>
        The daemon says this at startup. Enforcement does not depend on it —
        the refusal is on chain either way — but nothing reaches the ERC-8004
        registry until <C>CORDON_RECORD</C> names the seat.
      </P>
    </>
  );
}
