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

/**
 * The factory a name's own registry is deployed through.
 *
 * `ensdomains/verifiable-factory`, read 25 Sep 2026. The proxy address is
 * CREATE2 from `keccak256(abi.encode(msg.sender, salt))`, so two callers may
 * reuse a salt without colliding.
 */
interface IVerifiableFactory {
    function deployProxy(address implementation, uint256 salt, bytes memory data)
        external
        returns (address proxy);

    function predictProxyAddress(address deployer, uint256 salt)
        external
        view
        returns (address proxy);
}

interface IUserRegistry {
    function initialize(address rootAccount, uint256 roleBitmap) external;

    function setResolver(uint256 anyId, address resolver) external;

    function register(
        string memory label,
        address owner,
        address registry,
        address resolver,
        uint256 roleBitmap,
        uint64 expiry
    ) external returns (uint256);

    function unregister(uint256 anyId) external;

    function getSubregistry(string calldata label) external view returns (address);
    function getResolver(string calldata label) external view returns (address);
    function ownerOf(uint256 tokenId) external view returns (address);
}

interface IOwnedRegistry {
    function setSubregistry(uint256 anyId, address registry) external;
    function setResolver(uint256 anyId, address resolver) external;
    function ownerOf(uint256 tokenId) external view returns (address);
}

/**
 * ENSv2's Enhanced Access Control roles, copied from
 * `contracts/src/registry/libraries/RegistryRolesLib.sol` on 25 Sep 2026.
 *
 * Each role has an `_ADMIN` counterpart, shifted left by 128, which authorises
 * granting the role itself. Holding a role without its admin means holding it
 * and being unable to pass it on — which is the distinction the whole
 * permission model rests on.
 */
library EnsRoles {
    uint256 internal constant REGISTRAR = 1 << 0;
    uint256 internal constant REGISTER_RESERVED = 1 << 4;
    uint256 internal constant SET_PARENT = 1 << 8;
    uint256 internal constant UNREGISTER = 1 << 12;
    uint256 internal constant RENEW = 1 << 16;
    uint256 internal constant SET_SUBREGISTRY = 1 << 20;
    uint256 internal constant SET_RESOLVER = 1 << 24;
    uint256 internal constant SET_URI = 1 << 36;
    uint256 internal constant CAN_NAME = 1 << 120;
    uint256 internal constant UPGRADE = 1 << 124;

    function admin(uint256 role) internal pure returns (uint256) {
        return role << 128;
    }
}

interface IPermissionedResolver {
    function initialize(address admin, uint256 roleBitmap) external;
    function setAddr(bytes32 node, address addr_) external;
    function setText(bytes32 node, string calldata key, string calldata value) external;
    function addr(bytes32 node) external view returns (address payable);
    function text(bytes32 node, string calldata key) external view returns (string memory);
}

/**
 * The resolver's own roles, from
 * `contracts/src/resolver/libraries/PermissionedResolverLib.sol`, 25 Sep 2026.
 * Separate from `EnsRoles`: a registry and a resolver number their roles from
 * the same bit positions and mean different things by them.
 */
library EnsResolverRoles {
    uint256 internal constant SET_ADDR = 1 << 0;
    uint256 internal constant SET_TEXT = 1 << 4;
    uint256 internal constant SET_CONTENTHASH = 1 << 8;
    uint256 internal constant SET_NAME = 1 << 24;
    uint256 internal constant SET_ALIAS = 1 << 28;
    uint256 internal constant CLEAR = 1 << 32;
    uint256 internal constant SET_DATA = 1 << 36;
    uint256 internal constant UPGRADE = 1 << 124;

    function admin(uint256 role) internal pure returns (uint256) {
        return role << 128;
    }
}
