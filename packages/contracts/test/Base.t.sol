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
 * The four-agent tree from the plan, built once so every gate test argues
 * against the same shape.
 *
 *      root  (orchestrator)        budget  $100
 *        ├── childA (research)     budget   $60
 *        │     └── grandchild      budget   $30
 *        └── childB (enrichment)   budget   $60
 *
 * Every figure comes from packages/fixtures via Fixtures.gen.sol. The two
 * child budgets are the only derived numbers, and they derive from the root's.
 */
abstract contract Base is Test {
    MandateRegistry internal reg;
    TreeVault internal vault;
    MockUSDC internal usdc;
    MockGateway internal gateway;

    address internal owner = makeAddr("owner");
    address internal opRoot = makeAddr("daemon:root");
    address internal opA = makeAddr("daemon:childA");
    address internal opB = makeAddr("daemon:childB");
    address internal opG = makeAddr("daemon:grandchild");
    address internal deployer = makeAddr("deployer");

    address internal aisa = makeAddr("payee:aisa");
    address internal allium = makeAddr("payee:allium");
    address internal arkham = makeAddr("payee:arkham");

    bytes32 internal root;
    bytes32 internal childA;
    bytes32 internal childB;
    bytes32 internal grandchild;

    uint128 internal constant CHILD_BUDGET6 = Fixtures.BUDGET6 * 6 / 10;
    uint128 internal constant GRAND_BUDGET6 = Fixtures.BUDGET6 * 3 / 10;

    function setUp() public virtual {
        vm.startPrank(deployer);
        reg = new MandateRegistry();
        usdc = new MockUSDC();
        gateway = new MockGateway();
        vault = new TreeVault(IERC20(address(usdc)), reg, IGatewayWallet(address(gateway)));
        vm.stopPrank();

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

        vm.startPrank(opRoot);
        childA = reg.spawn(root, _params(opA, CHILD_BUDGET6));
        childB = reg.spawn(root, _params(opB, CHILD_BUDGET6));
        vm.stopPrank();

        vm.prank(opA);
        grandchild = reg.spawn(childA, _params(opG, GRAND_BUDGET6));

        usdc.mint(owner, Fixtures.BUDGET6 * 10);
        vm.startPrank(owner);
        usdc.approve(address(vault), type(uint256).max);
        vault.fund(root, Fixtures.BUDGET6);
        vm.stopPrank();
    }

    function _params(address op, uint128 budget6) internal pure returns (MandateRegistry.Params memory) {
        return MandateRegistry.Params({
            operator: op,
            budget6: budget6,
            windowSeconds: Fixtures.WINDOW_SECONDS,
            trancheCap6: Fixtures.TRANCHE6,
            concentrationBps: Fixtures.CONCENTRATION_BPS,
            maxDepth: Fixtures.MAX_DEPTH
        });
    }

    function _draw(address op, bytes32 node, address payee, uint128 amount6)
        internal
        returns (bool ok, uint256 refusalId, TreeVault.Reason reason)
    {
        vm.prank(op);
        (ok, refusalId, reason) = vault.draw(node, payee, amount6);
    }
}
