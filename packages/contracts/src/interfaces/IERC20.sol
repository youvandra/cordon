// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @dev The 6-decimal ERC-20 view of USDC. The vault never touches the
///      18-decimal native view, so no decimal scaling exists in Solidity.
interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function approve(address spender, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}
