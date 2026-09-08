// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "../../src/interfaces/IERC20.sol";

/**
 * The part of Circle's GatewayWallet that a contract can reach, and nothing
 * more — because nothing more is reachable.
 *
 * There is deliberately no `pay(seller, amount)` here. Spending a Gateway
 * balance is a burn intent signed off chain by its depositor, and modelling it
 * as a contract call would let the tests assert a guarantee the real system
 * does not give. `spendOffChain` stands in for that signature, and it takes no
 * permission from anyone, which is the point.
 */
contract MockGateway {
    mapping(address => mapping(address => uint256)) public availableBalance;

    event DepositedFor(address indexed token, address indexed depositor, uint256 value);

    function depositFor(address token, address depositor, uint256 value) external {
        IERC20(token).transferFrom(msg.sender, address(this), value);
        availableBalance[token][depositor] += value;
        emit DepositedFor(token, depositor, value);
    }

    /**
     * What the depositor can do with the balance once it is here: send it to
     * anyone, without asking. No contract sees the recipient, so no contract
     * can bound it. Tests use this to prove the limit of the claim rather than
     * to hide it.
     */
    function spendOffChain(address token, address to, uint256 value) external {
        availableBalance[token][msg.sender] -= value;
        IERC20(token).transfer(to, value);
    }
}
