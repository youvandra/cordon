// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {TreeVault} from "../src/TreeVault.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {Fixtures} from "./Fixtures.gen.sol";

/**
 * A handler that does whatever an unsupervised tree of agents would do:
 * draws at random nodes, for random amounts, to random sellers, spawning more
 * children as it goes. It is never told which draws will be refused.
 */
contract TreeHandler is Test {
    MandateRegistry public reg;
    TreeVault public vault;

    bytes32 public root;
    bytes32[] public nodes;
    mapping(bytes32 => address) public operatorOf;
    address[3] public payees;

    uint256 public released;
    uint256 public refused;

    constructor(MandateRegistry reg_, TreeVault vault_, bytes32 root_, address rootOperator) {
        reg = reg_;
        vault = vault_;
        root = root_;
        nodes.push(root_);
        operatorOf[root_] = rootOperator;
        payees = [makeAddr("seller:a"), makeAddr("seller:b"), makeAddr("seller:c")];
    }

    function nodeCount() external view returns (uint256) {
        return nodes.length;
    }

    function draw(uint256 nodeSeed, uint256 payeeSeed, uint128 amount) external {
        bytes32 node = nodes[nodeSeed % nodes.length];
        amount = uint128(bound(amount, 1, Fixtures.TRANCHE6 * 3));

        vm.prank(operatorOf[node]);
        (bool ok,,) = vault.draw(node, payees[payeeSeed % 3], amount);
        if (ok) ++released;
        else ++refused;
    }

    function spawn(uint256 parentSeed, uint128 budget6, uint128 tranche6, uint16 bps) external {
        bytes32 parent = nodes[parentSeed % nodes.length];
        MandateRegistry.Mandate memory m = reg.mandate(parent);
        if (m.depth >= m.maxDepth) return;

        address op = address(uint160(uint256(keccak256(abi.encode(parent, nodes.length)))));
        if (op == address(0)) return;

        MandateRegistry.Params memory p = MandateRegistry.Params({
            operator: op,
            budget6: uint128(bound(budget6, 1, m.budget6)),
            windowSeconds: m.windowSeconds,
            trancheCap6: uint128(bound(tranche6, 0, m.trancheCap6)),
            concentrationBps: uint16(bound(bps, 1, m.concentrationBps)),
            maxDepth: m.maxDepth
        });

        vm.prank(m.operator);
        bytes32 child = reg.spawn(parent, p);
        nodes.push(child);
        operatorOf[child] = op;
    }

    function warp(uint32 seconds_) external {
        vm.warp(block.timestamp + bound(seconds_, 1, Fixtures.WINDOW_SECONDS / 4));
    }
}

/**
 * G1 — stated as a property rather than as a list of examples.
 *
 * The tree grows, spawns, waits and spends without any guidance, and the two
 * things that must never be true are checked after every single call.
 */
contract G1_Invariant is Test {
    MandateRegistry internal reg;
    TreeVault internal vault;
    MockUSDC internal usdc;
    TreeHandler internal handler;

    address internal owner = makeAddr("owner");
    address internal opRoot = makeAddr("daemon:root");
    bytes32 internal root;

    function setUp() public {
        reg = new MandateRegistry();
        usdc = new MockUSDC();
        vault = new TreeVault(IERC20(address(usdc)), reg);

        vm.prank(owner);
        root = reg.open(
            MandateRegistry.Params({
                operator: opRoot,
                budget6: Fixtures.BUDGET6,
                windowSeconds: Fixtures.WINDOW_SECONDS,
                trancheCap6: Fixtures.TRANCHE6,
                concentrationBps: Fixtures.CONCENTRATION_BPS,
                maxDepth: Fixtures.MAX_DEPTH
            })
        );

        // Funded far beyond the mandate on purpose. The treasury must never be
        // what stops the tree; the mandate must be.
        usdc.mint(owner, Fixtures.BUDGET6 * 100);
        vm.startPrank(owner);
        usdc.approve(address(vault), type(uint256).max);
        vault.fund(root, Fixtures.BUDGET6 * 100);
        vm.stopPrank();

        handler = new TreeHandler(reg, vault, root, opRoot);
        targetContract(address(handler));
    }

    /// @dev The one claim, as an invariant: nobody computes the total, so the
    ///      contract does, and it holds under an unguided tree.
    function invariant_the_root_window_never_exceeds_the_budget_its_owner_signed() public view {
        assertLe(vault.windowSpent(root), Fixtures.BUDGET6);
    }

    /// @dev Every node obeys its own limit too, at every depth, at all times.
    function invariant_every_node_stays_inside_its_own_window() public view {
        uint256 n = handler.nodeCount();
        for (uint256 i = 0; i < n; ++i) {
            bytes32 node = handler.nodes(i);
            assertLe(vault.windowSpent(node), reg.mandate(node).budget6);
        }
    }

    /// @dev The vault's ledger and its actual token balance never diverge.
    function invariant_the_ledger_matches_the_balance() public view {
        assertEq(uint256(vault.treasury6(root)), usdc.balanceOf(address(vault)));
    }
}


/**
 * An invariant nothing ever breaks is usually an invariant nothing ever
 * reached, which is the defect this project has already paid for once: working
 * code whose test exercised a different path. The fuzzer resets its state
 * between runs, so coverage cannot be asserted from inside a run. It is
 * asserted here instead, by driving the same handler through a long scripted
 * sequence and checking that both outcomes actually happen.
 */
contract G1_InvariantIsNotVacuous is Test {
    MandateRegistry internal reg;
    TreeVault internal vault;
    MockUSDC internal usdc;
    TreeHandler internal handler;

    address internal owner = makeAddr("owner");
    address internal opRoot = makeAddr("daemon:root");
    bytes32 internal root;

    function setUp() public {
        reg = new MandateRegistry();
        usdc = new MockUSDC();
        vault = new TreeVault(IERC20(address(usdc)), reg);

        vm.prank(owner);
        root = reg.open(
            MandateRegistry.Params({
                operator: opRoot,
                budget6: Fixtures.BUDGET6,
                windowSeconds: Fixtures.WINDOW_SECONDS,
                trancheCap6: Fixtures.TRANCHE6,
                concentrationBps: Fixtures.CONCENTRATION_BPS,
                maxDepth: Fixtures.MAX_DEPTH
            })
        );

        usdc.mint(owner, Fixtures.BUDGET6 * 100);
        vm.startPrank(owner);
        usdc.approve(address(vault), type(uint256).max);
        vault.fund(root, Fixtures.BUDGET6 * 100);
        vm.stopPrank();

        handler = new TreeHandler(reg, vault, root, opRoot);
    }

    function test_the_handler_reaches_both_outcomes_and_the_invariants_hold_throughout() public {
        uint256 seed = uint256(keccak256("cordon:g1"));

        for (uint256 i = 0; i < 300; ++i) {
            seed = uint256(keccak256(abi.encode(seed, i)));

            if (i % 7 == 0) {
                handler.spawn(seed, uint128(seed >> 8), uint128(seed >> 24), uint16(seed >> 40));
            } else if (i % 11 == 0) {
                handler.warp(uint32(seed >> 56));
            } else {
                handler.draw(seed, seed >> 16, uint128(seed >> 32));
            }

            assertLe(vault.windowSpent(root), Fixtures.BUDGET6, "the root never exceeds its budget");
            uint256 n = handler.nodeCount();
            for (uint256 j = 0; j < n; ++j) {
                bytes32 node = handler.nodes(j);
                assertLe(vault.windowSpent(node), reg.mandate(node).budget6, "nor any node its own");
            }
            assertEq(uint256(vault.treasury6(root)), usdc.balanceOf(address(vault)), "the ledger matches the balance");
        }

        assertGt(handler.released(), 0, "the sequence never released anything");
        assertGt(handler.refused(), 0, "the sequence never reached a bound");
        assertGt(handler.nodeCount(), 1, "the tree never grew past its root");
        assertGt(vault.refusalCount(), 0, "and every refusal is a record on chain");
    }
}
