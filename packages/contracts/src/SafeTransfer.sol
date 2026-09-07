// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "./interfaces/IERC20.sol";

/// @dev USDC returns a bool; some tokens return nothing. Accept both, reject
///      an explicit false. Deliberately small — no library dependency belongs
///      in a contract whose whole claim is that it can be read end to end.
library SafeTransfer {
    error TransferFailed();

    function send(IERC20 token, address to, uint256 value) internal {
        (bool ok, bytes memory data) =
            address(token).call(abi.encodeCall(IERC20.transfer, (to, value)));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function pull(IERC20 token, address from, address to, uint256 value) internal {
        (bool ok, bytes memory data) =
            address(token).call(abi.encodeCall(IERC20.transferFrom, (from, to, value)));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }
}
