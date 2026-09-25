// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * The parts of ENSv2 this project calls, and nothing more.
 *
 * Written against `ensdomains/contracts-v2` at
 * `contracts/src/registrar/ETHRegistrar.sol`, read on 25 Sep 2026. ENSv2 is an
 * early preview and is redeployed as it changes, so this interface is checked
 * against the chain rather than trusted: every call below is made by a script
 * that reverts if the shape is wrong.
 */
interface IETHRegistrar {
    function isAvailable(string calldata label) external view returns (bool);

    function getRegisterPrice(string calldata label, uint64 duration, address paymentToken)
        external
        view
        returns (uint256 base, uint256 premium);

    function makeCommitment(
        string calldata label,
        address owner,
        bytes32 secret,
        address subregistry,
        address resolver,
        uint64 duration,
        bytes32 referrer
    ) external pure returns (bytes32);

    function commit(bytes32 commitment) external;

    function register(
        string calldata label,
        address owner,
        bytes32 secret,
        address subregistry,
        address resolver,
        uint64 duration,
        address paymentToken,
        bytes32 referrer
    ) external returns (uint256 tokenId);

    function MIN_COMMITMENT_AGE() external view returns (uint64);
}

interface IMintableToken {
    function mint(address to, uint256 amount) external;
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

interface IPermissionedRegistry {
    function getSubregistry(string calldata label) external view returns (address);
    function getResolver(string calldata label) external view returns (address);
}
