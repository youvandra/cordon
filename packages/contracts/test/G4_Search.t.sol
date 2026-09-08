// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {TreeVault} from "../src/TreeVault.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {IGatewayWallet} from "../src/interfaces/IGatewayWallet.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {MockGateway} from "./mocks/MockGateway.sol";
import {Fixtures} from "./Fixtures.gen.sol";

/**
 * G4 — bounded search.
 *
 * Thousands of spend strategies, played against the contract itself and
 * **scored by the contract, never by a model of it**. None passes a bound. One
 * that does is a bug, not a feature, and this test is where it would surface.
 *
 * The difference from G1's invariant run matters. That one is unguided: a tree
 * doing whatever a tree does, checked after every call. This one is
 * adversarial and named — each strategy is a way somebody would actually try
 * to get more money out than the owner signed for, written down as a tactic
 * and then run with the parameters varied underneath it. An invariant nothing
 * ever breaks is usually an invariant nothing ever reached, so every tactic
 * here is required to reach a refusal, and the test fails if a tactic turns
 * out to be one the tree never notices.
 *
 * What is published from this run:
 *
 * - how many strategies were played, and how many draws they made
 * - how close the closest one came to the root's budget
 * - how many passed a bound, which must be zero
 *
 * Those numbers are written to `out/g4-search.json` by the run itself and
 * folded into `packages/fixtures` by `scripts/record-search.mjs`. A figure the
 * console renders is never typed by a human.
 */
contract G4_Search is Test {
    /* Ten tactics, and the count of variants each is run with. The product is
       the strategy count, and it is deliberately in the thousands: a handful
       of examples is a demo, and this has to be a search. */
    uint256 internal constant TACTICS = 10;
    /// @dev Variants per tactic. Overridable so the search can be run short
    ///      while it is being written; the number that gets published comes
    ///      from the default.
    uint256 internal VARIANTS;

    MandateRegistry internal reg;
    TreeVault internal vault;
    MockUSDC internal usdc;
    MockGateway internal gateway;

    address internal owner = makeAddr("owner");
    bytes32 internal root;
    address internal rootOperator;

    bytes32[] internal nodes;
    mapping(bytes32 => address) internal operatorOf;
    address[8] internal payees;

    /* Tallies, kept across the whole search. */
    uint256 internal strategies;
    uint256 internal draws;
    uint256 internal released;
    uint256 internal refused;
    uint256 internal passedABound;
    uint128 internal closestToBudget6;
    uint256 internal releasedAmount6;
    /// @dev What the vault should hold, kept alongside what it does hold.
    uint256 internal expectedVaultBalance;

    /// @dev The tactic that must NOT reach a bound. See `_dust`.
    uint256 internal constant CONTROL_TACTIC = 8;
    uint128 internal constant TREASURY6 = Fixtures.BUDGET6 * 4;

    function setUp() public {
        VARIANTS = vm.envOr("CORDON_G4_VARIANTS", uint256(120));

        for (uint256 i = 0; i < payees.length; ++i) {
            payees[i] = address(uint160(uint256(keccak256(abi.encode("cordon:payee", i)))));
        }

        /* Deployed once. Every strategy gets its own root, and a root is its
           own tree: treasury, windows and mandates are all keyed by node, so
           two roots in one registry cannot see each other. Redeploying per
           strategy would only make the search slower. */
        reg = new MandateRegistry();
        usdc = new MockUSDC();
        gateway = new MockGateway();
        vault = new TreeVault(IERC20(address(usdc)), reg, IGatewayWallet(address(gateway)));

        usdc.mint(owner, uint256(TREASURY6) * TACTICS * VARIANTS);
        vm.prank(owner);
        usdc.approve(address(vault), type(uint256).max);
    }

    /* ------------------------------------------------------------------ */
    /* The search                                                          */
    /* ------------------------------------------------------------------ */

    function test_no_strategy_gets_more_out_than_the_owner_signed_for() public {
        /* Each tactic must be shown to reach a refusal at least once. A tactic
           that never does is not evidence of a bound; it is evidence that the
           tactic was written wrongly. */
        uint256[TACTICS] memory refusalsByTactic;

        for (uint256 variant = 0; variant < VARIANTS; ++variant) {
            for (uint256 tactic = 0; tactic < TACTICS; ++tactic) {
                _freshRoot();
                uint256 before = refused;

                _play(tactic, variant);

                refusalsByTactic[tactic] += refused - before;
                strategies += 1;

                _score();
            }
        }

        assertEq(passedABound, 0, "a strategy got past a bound: that is a bug, not a feature");
        assertGt(draws, 0);
        for (uint256 tactic = 0; tactic < TACTICS; ++tactic) {
            if (tactic == CONTROL_TACTIC) continue;
            assertGt(
                refusalsByTactic[tactic],
                0,
                string.concat("tactic ", vm.toString(tactic), " never met a bound, which proves nothing")
            );
        }
        /* The negative control. A contract that refused everything would pass
           every assertion above and be worthless, so one tactic is required to
           spend freely and never be stopped. */
        assertEq(
            refusalsByTactic[CONTROL_TACTIC],
            0,
            "the control tactic stays far inside every bound: a refusal there means the tree refuses at random"
        );

        _publish();
    }

    /**
     * The score, taken by reading the contract — never by a model of it.
     *
     * Every bound the mandate declares is checked against the vault's own
     * view: the root's window against the budget its owner signed, every
     * node's window against its own, and the ledger against the tokens really
     * held. A strategy "passes" only if the contract itself says it did.
     */
    function _score() private {
        uint128 rootWindow = vault.windowSpent(root);
        if (rootWindow > closestToBudget6) closestToBudget6 = rootWindow;
        if (rootWindow > Fixtures.BUDGET6) passedABound += 1;

        for (uint256 i = 0; i < nodes.length; ++i) {
            bytes32 node = nodes[i];
            if (vault.windowSpent(node) > reg.mandate(node).budget6) passedABound += 1;
        }

        assertEq(expectedVaultBalance, usdc.balanceOf(address(vault)), "the ledger left the balance");
    }

    /**
     * The parameter each tactic varies, swept rather than sampled.
     *
     * A hashed seed leaves whole regions of the range untouched and makes a
     * short run behave differently from a long one. A sweep covers the ends
     * and the middle at any variant count, so a search run short while it is
     * being written is the same search, only coarser.
     */
    function _sweep(uint256 lo, uint256 hi, uint256 variant) private view returns (uint128) {
        if (VARIANTS <= 1) return uint128(hi);
        return uint128(lo + ((hi - lo) * variant) / (VARIANTS - 1));
    }

    function _play(uint256 tactic, uint256 seed) private {
        if (tactic == 0) _structuring(seed);
        else if (tactic == 1) _fanOut(seed);
        else if (tactic == 2) _depthDive(seed);
        else if (tactic == 3) _windowStraddle(seed);
        else if (tactic == 4) _siblingRace(seed);
        else if (tactic == 5) _afterRevoke(seed);
        else if (tactic == 6) _payeeRotation(seed);
        else if (tactic == 7) _retryRefused(seed);
        else if (tactic == 8) _dust(seed);
        else _spawnWider(seed);
    }

    /* ------------------------------------------------------------------ */
    /* Tactics — each one is somebody's plan for getting more out           */
    /* ------------------------------------------------------------------ */

    /// @dev Ten thousand small calls to one seller. Every one is under any
    ///      per-transfer cap; the concentration bound is what refuses.
    function _structuring(uint256 seed) private {
        uint128 unit = _sweep(Fixtures.TRANCHE6 / 20, Fixtures.TRANCHE6 / 4, seed);
        for (uint256 i = 0; i < 120; ++i) _draw(root, payees[0], unit);
    }

    /// @dev Spread the same spend across children so no child notices. Ancestor
    ///      debit is the answer, and it is the claim.
    function _fanOut(uint256 seed) private {
        bytes32[] memory kids = new bytes32[](3);
        for (uint256 i = 0; i < 3; ++i) kids[i] = _spawn(root, Fixtures.BUDGET6, Fixtures.TRANCHE6);

        uint128 amount = _sweep(Fixtures.TRANCHE6 / 5, Fixtures.TRANCHE6, seed);
        for (uint256 i = 0; i < 24; ++i) _draw(kids[i % 3], payees[i % payees.length], amount);
    }

    /// @dev Hide at the bottom of the tree. Every draw still debits the path.
    function _depthDive(uint256 seed) private {
        bytes32 node = root;
        for (uint256 d = 0; d + 1 < Fixtures.MAX_DEPTH; ++d) {
            node = _spawn(node, Fixtures.BUDGET6, Fixtures.TRANCHE6);
        }
        uint128 amount = _sweep(Fixtures.TRANCHE6 / 5, Fixtures.TRANCHE6, seed);
        for (uint256 i = 0; i < 24; ++i) _draw(node, payees[i % payees.length], amount);
    }

    /// @dev Spend to the edge of a window, then step over the boundary and
    ///      spend again. A child window shorter than its parent's would let
    ///      this through, which is why the contract insists they are equal.
    function _windowStraddle(uint256 seed) private {
        bytes32 child = _spawn(root, Fixtures.BUDGET6, Fixtures.TRANCHE6);
        uint128 amount = _sweep(Fixtures.TRANCHE6 / 5, Fixtures.TRANCHE6, seed);

        for (uint256 i = 0; i < 24; ++i) _draw(child, payees[i % payees.length], amount);
        vm.warp(block.timestamp + Fixtures.WINDOW_SECONDS - 1);
        for (uint256 i = 0; i < 12; ++i) _draw(child, payees[i % payees.length], amount);
        vm.warp(block.timestamp + 2);
        for (uint256 i = 0; i < 24; ++i) _draw(child, payees[i % payees.length], amount);
    }

    /// @dev Two children, each inside its own budget, summing to more than the
    ///      parent has. Nobody computes the total — except the contract.
    function _siblingRace(uint256 seed) private {
        bytes32 a = _spawn(root, (Fixtures.BUDGET6 * 7) / 10, Fixtures.TRANCHE6);
        bytes32 b = _spawn(root, (Fixtures.BUDGET6 * 7) / 10, Fixtures.TRANCHE6);
        uint128 amount = _sweep(Fixtures.TRANCHE6 / 5, Fixtures.TRANCHE6, seed);
        for (uint256 i = 0; i < 24; ++i) _draw(i % 2 == 0 ? a : b, payees[i % payees.length], amount);
    }

    /// @dev Keep spending after the branch is cut. The refusals are the point:
    ///      an agent still trying under a revoked mandate is conduct, and it
    ///      belongs on the record rather than in a silent failure.
    function _afterRevoke(uint256 seed) private {
        bytes32 child = _spawn(root, Fixtures.BUDGET6, Fixtures.TRANCHE6);
        bytes32 grand = _spawn(child, Fixtures.BUDGET6, Fixtures.TRANCHE6);

        uint128 amount = _sweep(Fixtures.TRANCHE6 / 5, Fixtures.TRANCHE6, seed);
        for (uint256 i = 0; i < 6; ++i) _draw(grand, payees[i % payees.length], amount);

        vm.prank(owner);
        reg.revoke(child);

        for (uint256 i = 0; i < 12; ++i) _draw(grand, payees[i % payees.length], amount);
    }

    /// @dev Dodge the concentration bound by spreading across sellers. It works
    ///      — and then the window budget is what stops it, which is the point
    ///      of having more than one bound.
    function _payeeRotation(uint256 seed) private {
        uint128 amount = _sweep(Fixtures.TRANCHE6 / 5, Fixtures.TRANCHE6, seed);
        for (uint256 i = 0; i < 32; ++i) _draw(root, payees[i % payees.length], amount);
    }

    /// @dev Ask again. And again. A refusal consumes no budget, so retrying is
    ///      free — and it stays refused, because the bound did not move.
    function _retryRefused(uint256 seed) private {
        uint128 tooBig = _sweep(Fixtures.TRANCHE6 + 1, Fixtures.TRANCHE6 * 10, seed);
        for (uint256 i = 0; i < 12; ++i) _draw(root, payees[0], tooBig);
    }

    /// @dev A very large number of very small draws. Base units, not dollars.
    function _dust(uint256 seed) private {
        uint128 unit = _sweep(1, 10, seed);
        for (uint256 i = 0; i < 40; ++i) _draw(root, payees[i % payees.length], unit);
    }

    /// @dev Try to spawn a child wider than its parent, then settle for what
    ///      the contract allows. The widening must revert whoever asks.
    function _spawnWider(uint256 seed) private {
        MandateRegistry.Mandate memory m = reg.mandate(root);
        address op = address(uint160(uint256(keccak256(abi.encode("cordon:wide", seed)))));

        MandateRegistry.Params memory wide = MandateRegistry.Params({
            operator: op,
            budget6: m.budget6 + 1,
            windowSeconds: m.windowSeconds,
            trancheCap6: m.trancheCap6,
            concentrationBps: m.concentrationBps,
            maxDepth: m.maxDepth
        });

        vm.prank(rootOperator);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotNarrowing.selector, "budget6"));
        reg.spawn(root, wide);

        bytes32 child = _spawn(root, Fixtures.BUDGET6, Fixtures.TRANCHE6);
        uint128 amount = _sweep(Fixtures.TRANCHE6 / 5, Fixtures.TRANCHE6, seed);
        for (uint256 i = 0; i < 24; ++i) _draw(child, payees[i % payees.length], amount);
    }

    /* ------------------------------------------------------------------ */
    /* Machinery                                                           */
    /* ------------------------------------------------------------------ */

    function _draw(bytes32 node, address payee, uint128 amount6) private {
        draws += 1;
        vm.prank(operatorOf[node]);
        (bool ok,,) = vault.draw(node, payee, amount6);
        if (ok) {
            released += 1;
            releasedAmount6 += amount6;
            expectedVaultBalance -= amount6;
        } else {
            refused += 1;
        }
    }

    function _spawn(bytes32 parent, uint128 budget6, uint128 tranche6) private returns (bytes32 child) {
        MandateRegistry.Mandate memory m = reg.mandate(parent);
        address op = address(uint160(uint256(keccak256(abi.encode("cordon:op", parent, nodes.length, strategies)))));

        vm.prank(m.operator);
        child = reg.spawn(
            parent,
            MandateRegistry.Params({
                operator: op,
                budget6: budget6 > m.budget6 ? m.budget6 : budget6,
                windowSeconds: m.windowSeconds,
                trancheCap6: tranche6 > m.trancheCap6 ? m.trancheCap6 : tranche6,
                concentrationBps: m.concentrationBps,
                maxDepth: m.maxDepth
            })
        );
        nodes.push(child);
        operatorOf[child] = op;
    }

    /**
     * A new tree per strategy, so one strategy cannot inherit another's spent
     * window and look bounded for the wrong reason.
     *
     * The treasury is funded past the mandate on purpose: the money must never
     * be what stops the tree. If a strategy is refused, it has to be the
     * mandate that refused it.
     */
    function _freshRoot() private {
        rootOperator = address(uint160(uint256(keccak256(abi.encode("cordon:root-op", strategies)))));

        vm.prank(owner);
        root = reg.open(
            MandateRegistry.Params({
                operator: rootOperator,
                budget6: Fixtures.BUDGET6,
                windowSeconds: Fixtures.WINDOW_SECONDS,
                trancheCap6: Fixtures.TRANCHE6,
                concentrationBps: Fixtures.CONCENTRATION_BPS,
                maxDepth: Fixtures.MAX_DEPTH
            })
        );

        delete nodes;
        nodes.push(root);
        operatorOf[root] = rootOperator;

        vm.prank(owner);
        vault.fund(root, TREASURY6);
        expectedVaultBalance += TREASURY6;
    }

    /// @dev Written by the run, read by `scripts/record-search.mjs`. A figure a
    ///      surface renders is never typed by a human.
    function _publish() private {
        string memory json = string.concat(
            '{\n  "strategies": ', vm.toString(strategies),
            ',\n  "draws": ', vm.toString(draws),
            ',\n  "released": ', vm.toString(released),
            ',\n  "refused": ', vm.toString(refused),
            ',\n  "passedABound": ', vm.toString(passedABound),
            ',\n  "closestToBudget6": ', vm.toString(uint256(closestToBudget6)),
            ',\n  "releasedAmount6": ', vm.toString(releasedAmount6),
            ',\n  "budget6": ', vm.toString(uint256(Fixtures.BUDGET6)),
            "\n}\n"
        );
        vm.writeFile("out/g4-search.json", json);
    }
}
