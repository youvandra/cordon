// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @dev The 6-decimal ERC-20 view again, plus the one thing x402 `exact`
///      needs from a token: EIP-3009 `transferWithAuthorization`. Cordon's own
///      `/attest` endpoint is paid this way, so the collector has something
///      real to settle against in a test rather than a stub of itself.
///
///      Both signature shapes are here on purpose. FiatTokenV2 takes
///      `(v, r, s)` and V2_2 takes `bytes`, and the collector finds out which
///      by simulating; a mock with only one shape would never exercise that.
contract Mock3009 {
    string public constant name = "USD Coin";
    string public constant version = "2";
    string public constant symbol = "USDC";
    uint8 public constant decimals = 6;

    bytes32 public constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    bytes32 public immutable DOMAIN_SEPARATOR;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(bytes32 => bool)) public authorizationState;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);

    constructor() {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                block.chainid,
                address(this)
            )
        );
    }

    function mint(address to, uint256 v) external {
        balanceOf[to] += v;
    }

    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external {
        require(signature.length == 65, "bad signature length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        _transferWithAuthorization(from, to, value, validAfter, validBefore, nonce, v, r, s);
    }

    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        _transferWithAuthorization(from, to, value, validAfter, validBefore, nonce, v, r, s);
    }

    function _transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal {
        require(block.timestamp > validAfter, "authorization is not yet valid");
        require(block.timestamp < validBefore, "authorization is expired");
        require(!authorizationState[from][nonce], "authorization is used");

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(
                    abi.encode(
                        TRANSFER_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce
                    )
                )
            )
        );
        require(ecrecover(digest, v, r, s) == from, "invalid signature");

        authorizationState[from][nonce] = true;
        balanceOf[from] -= value;
        balanceOf[to] += value;

        emit AuthorizationUsed(from, nonce);
        emit Transfer(from, to, value);
    }
}
