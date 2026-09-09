import { Link } from "react-router-dom";
import { MANDATE, REASON_MEANING, formatUsdc } from "@cordon/fixtures";
import { TREE } from "@cordon/fixtures/preview";
import { C, Code, H2, H3, Lead, Note, OL, P, Table, UL } from "../parts";

/* The branch the ancestor-debit example walks down. Named here so the figures
   below are the demo tree's own, not a second set that can disagree with it. */
const WORKER = TREE.children[0]!;
const LEAF = WORKER.children[0]!;

export function MandateTree() {
  return (
    <>
      <Lead>
        A mandate is a set of limits with an owner behind it. A tree of mandates
        is one root the owner signed and any number of children created
        underneath it, each narrower than its parent.
      </Lead>
      <Note tone="info" title="Every node is one of your own agents">
        A tree bounds the keys you control, so the nodes in it are your fleet —
        not the sellers you buy from. An agent somebody else runs cannot be put
        under your mandate, because there is no key of theirs for it to bound.
        They appear here only as a counterparty: an address that was paid.
      </Note>

      <H2 id="the-root">The root</H2>
      <P>
        The owner opens the root from their own wallet. This is the one moment a
        person authorises the tree, and no server can do it for them. The root
        carries six numbers:
      </P>
      <Table
        head={["Field", "Meaning", "Example"]}
        rows={[
          ["budget", "how much the whole tree may spend in one window", formatUsdc(MANDATE.budget6, 0)],
          ["window", "the length of that window, in seconds", `${MANDATE.windowSeconds}`],
          ["lifetime cap", "how much it may spend in total, ever; this one never resets", formatUsdc(MANDATE.lifetimeCap6, 0)],
          ["tranche cap", "the most any single purchase may cost", formatUsdc(MANDATE.tranche6, 0)],
          ["concentration", "the share of a window one seller may take", `${MANDATE.concentrationBoundPct}%`],
          ["max depth", "how deep the tree may go", `${MANDATE.maxDepth}`],
        ]}
      />

      <H2 id="children">Children</H2>
      <P>
        A parent creates a child without asking the owner. That is deliberate.
        Spawns happen in seconds, often while the owner is asleep, so a per
        spawn approval is a control nobody could actually operate. Safety comes
        from the shape instead: the contract refuses a child that is wider than
        its parent, whoever asks, including the owner.
      </P>
      <UL>
        <li>Budget, lifetime cap, tranche cap and concentration may only shrink.</li>
        <li>Depth may only increase, and never past the root's maximum.</li>
        <li>
          The window must be <b>equal</b> to the parent's, never shorter.
        </li>
      </UL>
      <Note tone="warn" title="Why the window cannot shrink">
        A shorter child window resets faster than the parent it is charging.
        Given a child window of an hour under a parent window of a day, the
        child refills twenty four times while the parent refills once, and the
        parent's budget leaks out an hour at a time.
      </Note>

      <H2 id="ancestor-debit">Ancestor debit</H2>
      <P>
        Every purchase is charged to the node that made it and to every node
        above it. A grandchild spending a dollar moves its parent's bar and its
        grandparent's bar by a dollar each. This is the part no per agent wallet
        and no per session limit can do, and it is the reason a tree has a total
        at all.
      </P>
      {/* Derived from the mandate, never typed. A tree written in dollars is
          a tree that has to be retyped every time the mandate is resized, and
          the failure is silent: a child left at $70 under a $20 root is a
          child larger than the tree it hangs from. */}
      <Code>{`root        ${formatUsdc(TREE.budget6, 0)} budget      spent ${formatUsdc(TREE.spent6)}
 └─ worker   ${formatUsdc(WORKER.budget6, 0)} budget      spent ${formatUsdc(WORKER.spent6)}
     └─ leaf ${formatUsdc(LEAF.budget6, 0)} budget      spent ${formatUsdc(LEAF.spent6)}   ← its own budget is fine
                                              the root's is what refuses`}</Code>

      <H2 id="revocation">Revocation</H2>
      <P>
        The owner can cut a node. The node and everything under it stop being
        able to draw, in one transaction. A cut branch that keeps trying is not
        an error, it is conduct, and it goes on the record like anything else.
      </P>
      <P>
        There is no way back. See{" "}
        <Link to="/docs/refusals">Refusals, release, revocation</Link>.
      </P>
    </>
  );
}

export function DrawsAndBounds() {
  return (
    <>
      <Lead>
        A draw is a request for exactly enough money to make one purchase, for
        exactly one named recipient. Four checks run on every node from the
        asking agent up to the root, and all of them have to pass.
      </Lead>

      <H2 id="what-a-draw-is">What a draw is</H2>
      <P>
        The daemon reads the seller's challenge, takes the price and the address
        out of it, and asks the vault for that amount for that address. Neither
        number is chosen by the agent and neither is chosen by Cordon. A seller
        asking for $200 is refused by the contract rather than argued with.
      </P>
      <Note tone="info" title="There is no bare draw">
        The vault has no way to ask for money without naming who it is for. A
        tranche with no purchase behind it is exactly the unattributed float
        this design exists to remove.
      </Note>

      <H2 id="the-five-bounds">The five bounds</H2>
      <H3 id="tranche-cap">Tranche cap</H3>
      <P>
        No single draw may exceed the cap. This is what stops one plausible
        looking call from costing two hundred dollars.
      </P>

      <H3 id="window-budget">Window budget</H3>
      <P>
        The node's spend inside the current window plus this draw must fit the
        node's budget. Windows tumble in whole steps, so a parent and a child of
        equal length stay in phase forever.
      </P>

      <H3 id="lifetime-cap">Lifetime cap</H3>
      <P>
        The node's spend since it was opened, plus this draw, must fit the total
        the owner signed for. The window above rolls; this does not. Without it
        a budget is a rate, and a mandate left running for a week authorises
        seven windows of it.
      </P>

      <H3 id="concentration">Concentration</H3>
      <P>
        No one recipient may take more than its share of a window. This is what
        catches ten thousand small purchases from one seller, each of them
        comfortably under the cap.
      </P>
      <Note tone="warn" title="This one names its edge">
        A payment leaves the balance through a signature no contract can read,
        so what is bounded here is the recipient the daemon declares on chain
        before paying. A daemon that declared one seller and paid another is
        caught by reconciliation afterwards, not by this check.
      </Note>

      <H3 id="ancestor-debit-check">Ancestor debit</H3>
      <P>
        All of the above are evaluated for every node on the path, not only for
        the node that asked. This is the check that makes delegation safe, and
        the only one of the five that does not exist somewhere else already.
      </P>

      <H2 id="order">The order things happen in</H2>
      <OL>
        <li>Is any node on the path revoked?</li>
        <li>For each node from the asker to the root: cap, then window, then lifetime, then concentration.</li>
        <li>Does the treasury actually hold the money?</li>
      </OL>
      <P>
        The first failure wins and is reported with the node it belonged to. A
        refusal at the root, caused by a grandchild, names the root as the bound
        and the grandchild as the asker.
      </P>

      <H2 id="headroom">Headroom</H2>
      <P>
        Headroom is what a node may still draw right now, and which node is the
        reason. It is often an ancestor, and it is the tighter of the window and
        the lifetime — a figure that reported only the window would promise
        money the lifetime refuses. A tool that reported a node's own remaining
        budget would be reporting a number that does not decide anything.
      </P>

      <H2 id="the-figures">The figures, and why they do not add up</H2>
      <P>
        Six numbers appear on these surfaces. Exactly one of them is a balance,
        and no two of them may be added together or subtracted from each other
        to get a third. Each is read from the chain rather than kept
        anywhere, and the view it comes off is named beside it — a surface
        that words one of them differently is still reading the same call.
      </P>
      <Table
        head={["figure", "what it is", "read from"]}
        rows={[
          [
            "Authorised",
            "The window budget and the lifetime cap the owner signed. A permission, not money.",
            <C key="a">mandateOf(node)</C>,
          ],
          [
            "Funded",
            "USDC the vault actually holds for this root. The only balance here.",
            <C key="f">treasury6(root)</C>,
          ],
          [
            "Spent this window",
            "Drawn by this node and everything under it since the window last rolled. Resets.",
            <C key="w">windowSpent(node)</C>,
          ],
          [
            "Spent since opening",
            "Drawn by this node and everything under it for the life of the mandate. Never resets.",
            <C key="l">lifetimeSpent(node)</C>,
          ],
          [
            "Available",
            "What this node may draw right now, and which node is the reason.",
            <C key="h">headroom(node)</C>,
          ],
          [
            "Released",
            "Paid out past a refusal, by the owner's own signature.",
            <C key="r">Released</C>,
          ],
        ]}
      />
      <P>Four subtractions a reader will try, and what each one actually gets:</P>
      <UL>
        <li>
          <b>Authorised does not sum down the tree.</b> Children may be
          authorised for more than their parent between them, because
          delegation hands out permission and not money. The figure on the
          landing page draws exactly this.
        </li>
        <li>
          <b>Authorised minus spent is not available.</b> An ancestor is
          usually the tighter bound, and a node with its own window untouched
          can be able to draw nothing.
        </li>
        <li>
          <b>Funded is not authorised, in either direction.</b> A vault holding
          more than the mandate allows changes nothing, and a vault holding
          less refuses with <C>vault-balance</C> while every bound still has
          room.
        </li>
        <li>
          <b>Released is not spent.</b> It leaves the funded balance and
          touches neither the window nor the lifetime, because that money was
          never inside the authority those bounds describe. Which is the reason
          it is written into the record beside the refusal it overrode.
        </li>
      </UL>
    </>
  );
}

export function Refusals() {
  return (
    <>
      <Lead>
        A refusal is a decision the contract made and wrote down. It is not an
        error, and it is not a message from a server that could have said
        something else.
      </Lead>

      <H2 id="what-a-refusal-is">What a refusal is</H2>
      <UL>
        <li>
          It returns rather than reverting. A revert would roll back the event,
          and a refusal that leaves no trace is not a record.
        </li>
        <li>
          It consumes no budget. Window state is untouched, so asking again
          costs nothing and changes nothing.
        </li>
        <li>
          It carries the node that asked, the node whose bound stopped it, the
          amount, the recipient and the reason.
        </li>
      </UL>

      <H2 id="reasons">Reasons</H2>
      {/* The sentences live in fixtures, beside every other thing this project
          shows a reader, because the MCP and the public record page print the
          same ones. */}
      <Table
        head={["Reason", "What happened"]}
        rows={Object.entries(REASON_MEANING).map(([reason, meaning]) => [
          <C key={reason}>{reason}</C>,
          meaning,
        ])}
      />

      <H2 id="release">Release</H2>
      <P>
        There is a way out and it is human. The owner signs a release for one
        specific refusal, from their own key, and the money moves. What that
        does not do:
      </P>
      <UL>
        <li>It does not raise the bound. The same purchase is refused again a second later.</li>
        <li>It does not erase the refusal. Both are on the record, side by side, forever.</li>
        <li>It cannot be done by us, by the deployer, or by any admin key, because there is none.</li>
      </UL>
      <Note tone="good" title="The 2am answer">
        A finance lead wants an override, and “we can never undo this” reads as
        a defect. Release is that override. What cannot be reversed is the
        bound, not the decision.
      </Note>

      <H2 id="revocation">Revocation</H2>
      <P>
        Cutting a node cuts everything under it, in one transaction. Draws from
        anywhere in that subtree are refused with reason <C>revoked</C>, and
        those refusals are recorded like any other. There is no un-revoke.
      </P>

      <H2 id="retrying">Retrying</H2>
      <P>
        An agent that keeps asking is not doing anything dangerous. Every retry
        is evaluated fresh, costs no budget, and adds another line to the
        record. That last part is the reason retries are worth logging rather
        than rate limiting: a subtree that hammers a bound is telling you
        something about itself.
      </P>
    </>
  );
}

export function TheRecord() {
  return (
    <>
      <Lead>
        Cordon writes conduct into ERC-8004, the shared reputation registry that
        is already live. Every entry names the refusal it came from, and only
        the thing that does the refusing can write one.
      </Lead>

      <H2 id="why-the-existing-data-is-worthless">Why the existing data is worthless</H2>
      <P>
        The registry is a genuine public good on the read side. What is in it is
        not. Reputation there is an opinion somebody types, and typing is free:
        most reviewers on Base are flagged as fake, almost no entry has a
        payment behind it, and flipping an agent's standing costs a third of a
        cent.
      </P>

      <H2 id="what-cordon-writes">What Cordon writes</H2>
      <P>
        A different kind of object. Not a rating and not a score, but a
        measurement a contract made:
      </P>
      <Code>{`this node was refused $2.40 by its grandparent's window budget,
and here is the refusal it came from`}</Code>
      <UL>
        <li>It is not a vote, so it cannot be faked by volume.</li>
        <li>
          It carries payment linkage by construction, because every draw is a
          payment authorisation.
        </li>
        <li>
          It can only come from the enforcement seat. You have to be the thing
          that refuses in order to hold a record of refusals.
        </li>
      </UL>

      <H2 id="how-it-cannot-be-forged">How it cannot be forged</H2>
      <P>
        The writing contract takes a refusal id and nothing else. Every field it
        publishes is read out of the vault inside the same call, so there is no
        parameter through which a caller could supply an amount or a node. An id
        the vault does not hold reverts.
      </P>
      <P>
        Feedback in the registry is filed under the address that wrote it.
        Anyone may write their own opinion, as they always could, but nobody can
        write one that reads as Cordon's, and nobody else has refusals to
        report.
      </P>

      <H2 id="identity">Identity</H2>
      <P>
        Each node is linked to an ERC-8004 identity held by its own operator
        key. Cordon does not register that identity and does not hold it. A
        record about a token we control would be the same shape as the thing it
        replaces. The link is checked on chain when it is made.
      </P>

      <H2 id="reading-it">Reading it</H2>
      <P>
        The public record page for an agent is open to anyone, with no wallet
        and no account: sellers read it before serving, underwriters before
        pricing, other owners before hiring. The{" "}
        <Link to="/docs/meter">meter</Link> serves the same data as JSON.
      </P>
    </>
  );
}
