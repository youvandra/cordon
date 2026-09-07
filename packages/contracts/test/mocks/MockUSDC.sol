// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @dev The 6-decimal ERC-20 view, and only that. The 18-decimal native view
///      never reaches the vault, so it is not modelled here either.
contract MockUSDC {
    string public constant name = "USD Coin";
    string public constant symbol = "USDC";
    uint8 public constant decimals = 6;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 v) external {
        balanceOf[to] += v;
    }

    function approve(address s, uint256 v) external returns (bool) {
        allowance[msg.sender][s] = v;
        return true;
    }

    function transfer(address to, uint256 v) external returns (bool) {
        balanceOf[msg.sender] -= v;
        balanceOf[to] += v;
        return true;
    }

    function transferFrom(address f, address t, uint256 v) external returns (bool) {
        uint256 a = allowance[f][msg.sender];
        if (a != type(uint256).max) allowance[f][msg.sender] = a - v;
        balanceOf[f] -= v;
        balanceOf[t] += v;
        return true;
    }
}
