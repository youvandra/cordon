// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * The part of Circle's GatewayWallet the vault uses.
 *
 * `depositFor` credits the `depositor` parameter rather than `msg.sender`,
 * which is what lets the vault fund a daemon's balance without ever handing
 * that daemon a transfer. Verified against Arc testnet on 2026-09-08 at
 * 0x0077777d7EBA4688BDeF3E311b846F25870A19B9.
 *
 * Nothing else in Gateway is reachable from a contract. A payment out of a
 * Gateway balance is a burn intent signed off chain by its depositor, and the
 * seller is a field inside that signature — so no contract, ours included,
 * can sit in the path of one payment or see who it goes to.
 */
interface IGatewayWallet {
    function depositFor(address token, address depositor, uint256 value) external;
    function availableBalance(address token, address depositor) external view returns (uint256);
}
