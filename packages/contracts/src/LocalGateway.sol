// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "./interfaces/IERC20.sol";
import {SafeTransfer} from "./SafeTransfer.sol";

/**
 * The settlement rail on a chain where Circle's Gateway is absent.
 *
 * Sepolia has USDC and both ERC-8004 registries; it has no GatewayWallet.
 * `TreeVault` takes an `IGatewayWallet` and calls `depositFor` in two places,
 * so the chain is served by satisfying that interface rather than by editing a
 * rehearsed contract and every test that builds a vault.
 *
 * A draw here lands in the operator's own wallet. On Arc it lands in a Gateway
 * balance the operator spends by signing a burn intent. Both end the same way:
 * the money is the operator's, and nothing downstream of the deposit is
 * bounded. The enforcement is upstream, in `TreeVault.draw` — caps, windows,
 * concentration, the debit of every ancestor, the refusal — and it is
 * identical on both chains because it is the same bytecode reading the same
 * mandate.
 *
 * No owner, no admin, no pause. This contract holds nothing, so there is
 * nothing here to seize or to stop, and adding a seat that could do either
 * would put an off-chain control in a path whose whole claim is that it has
 * none.
 *
 * `availableBalance` answers with the depositor's whole USDC balance, which is
 * the honest answer when the deposit is the balance. It counts dollars that
 * arrived from anywhere, so a reader comparing it against what Cordon drew —
 * `packages/meter`'s reconcile does exactly that — is reading a wider number
 * on this chain than on Arc.
 */
contract LocalGateway {
    using SafeTransfer for IERC20;

    event DepositedFor(address indexed token, address indexed depositor, uint256 value);

    /**
     * Move `value` from the caller to `depositor`.
     *
     * The vault approves exactly this amount immediately before calling and
     * the allowance is consumed by it, so this contract never carries a
     * standing claim on the vault's treasury.
     */
    function depositFor(address token, address depositor, uint256 value) external {
        IERC20(token).pull(msg.sender, depositor, value);
        emit DepositedFor(token, depositor, value);
    }

    function availableBalance(address token, address depositor) external view returns (uint256) {
        return IERC20(token).balanceOf(depositor);
    }
}
