// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {LocalGateway} from "../src/LocalGateway.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {TreeVault} from "../src/TreeVault.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {IGatewayWallet} from "../src/interfaces/IGatewayWallet.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {Fixtures} from "./Fixtures.gen.sol";
import {NO_LIFETIME_BOUND} from "./Bounds.sol";

/**
 * The rail on a chain with no Gateway.
 *
 * Every other test here builds its vault against `MockGateway`, which is the
 * Arc shape: the deposit lands in a balance the gateway holds. This one builds
 * the vault against the contract that ships, and asserts the two things that
 * differ — where the money ends up, and what `availableBalance` counts.
 *
 * The gates themselves are argued elsewhere and are untouched by this: the
 * vault reaches its gateway only after it has decided, so a chain swap can
 * change where an allowed draw lands and can reach nothing that decides
 * whether it was allowed.
 */
contract LocalGatewayTest is Test {
    MandateRegistry internal reg;
    TreeVault internal vault;
    MockUSDC internal usdc;
    LocalGateway internal gateway;

    address internal owner = makeAddr("owner");
    address internal operator = makeAddr("daemon:root");
    address internal seller = makeAddr("payee:aisa");

    bytes32 internal root;

    function setUp() public {
        reg = new MandateRegistry();
        usdc = new MockUSDC();
        gateway = new LocalGateway();
        /* The constructor takes `IGatewayWallet`, so this line is the
           conformance check: a shim missing either function fails to compile
           here rather than at a deposit on a live chain. */
        vault = new TreeVault(IERC20(address(usdc)), reg, IGatewayWallet(address(gateway)));

        vm.prank(owner);
        root = reg.open(
            MandateRegistry.Params({
                operator: operator,
                budget6: Fixtures.BUDGET6,
                lifetimeCap6: NO_LIFETIME_BOUND,
                windowSeconds: Fixtures.WINDOW_SECONDS,
                trancheCap6: Fixtures.TRANCHE6,
                concentrationBps: Fixtures.CONCENTRATION_BPS,
                maxDepth: Fixtures.MAX_DEPTH
            })
        );

        usdc.mint(owner, Fixtures.BUDGET6 * 10);
        vm.startPrank(owner);
        usdc.approve(address(vault), type(uint256).max);
        vault.fund(root, Fixtures.BUDGET6);
        vm.stopPrank();
    }

    /// An allowed draw leaves the vault and arrives in the operator's wallet.
    function test_draw_lands_in_the_operators_own_wallet() public {
        uint128 amount6 = Fixtures.TRANCHE6;
        uint256 held = usdc.balanceOf(address(vault));

        vm.prank(operator);
        (bool released,, TreeVault.Reason reason) = vault.draw(root, seller, amount6);

        assertTrue(released, "the draw was within every bound");
        assertEq(uint8(reason), uint8(TreeVault.Reason.None));
        assertEq(usdc.balanceOf(operator), amount6, "the operator holds it");
        assertEq(usdc.balanceOf(address(vault)), held - amount6, "the vault let go of it");
        assertEq(usdc.balanceOf(address(gateway)), 0, "the rail holds nothing");
    }

    /// The allowance the vault opens for the deposit is closed by it.
    function test_the_rail_carries_no_standing_claim_on_the_treasury() public {
        vm.prank(operator);
        vault.draw(root, seller, Fixtures.TRANCHE6);

        assertEq(usdc.allowance(address(vault), address(gateway)), 0);
    }

    /// `availableBalance` answers with the wallet, because the wallet is where
    /// the deposit went.
    function test_available_balance_reads_the_depositors_wallet() public {
        assertEq(gateway.availableBalance(address(usdc), operator), 0);

        vm.prank(operator);
        vault.draw(root, seller, Fixtures.TRANCHE6);

        assertEq(gateway.availableBalance(address(usdc), operator), Fixtures.TRANCHE6);
    }

    /**
     * And it counts dollars Cordon never drew.
     *
     * On Arc the same call answers with a Gateway balance, which only a
     * deposit can raise. Asserted rather than remarked on, because
     * `packages/meter` reconciles what an operator holds against what the
     * vault released, and on this chain that comparison reads a wider number.
     */
    function test_available_balance_counts_money_from_anywhere() public {
        usdc.mint(operator, 5_000_000);

        assertEq(gateway.availableBalance(address(usdc), operator), 5_000_000);
    }

    /// A refused draw moves nothing, on this rail as on the other.
    function test_a_refusal_deposits_nothing() public {
        uint128 tooMuch = Fixtures.TRANCHE6 + 1;

        vm.prank(operator);
        (bool released,, TreeVault.Reason reason) = vault.draw(root, seller, tooMuch);

        assertFalse(released);
        assertEq(uint8(reason), uint8(TreeVault.Reason.TrancheCap));
        assertEq(usdc.balanceOf(operator), 0, "nothing arrived");
    }
}
