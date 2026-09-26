// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MandateRegistry} from "./MandateRegistry.sol";
import {TreeVault} from "./TreeVault.sol";

/**
 * CordonResolver — the bound, answered by the contract at resolve time.
 *
 * Every other way this project put an agent on ENS wrote a text record: a
 * script deployed a resolver per name and called `setText` six times. That
 * works, and it is a copy. A mandate narrows, a branch is cut, a window rolls —
 * and the record says whatever it said when the script ran. The honest advice
 * that follows is "read the contract, not the record", which is correct and is
 * also an admission that the name is decoration.
 *
 * This resolver removes the copy. `text(node, "cordon.live")` calls
 * `MandateRegistry.revokedAt` while answering; `cordon.headroom` calls
 * `TreeVault.headroom`. There is no stored value to drift, so:
 *
 *  - a revocation reaches ENS in the transaction that revokes, with no second
 *    write and nothing to remember,
 *  - an ordinary `getText` — the call every ENS library in every language
 *    already makes — becomes a live authorisation check, with no Cordon SDK and
 *    no permission from us,
 *  - and ENSIP-10 wildcard resolution means one resolver serves a whole tree,
 *    so a spawn needs no ENS transaction at all.
 *
 * What it will not do is state a bound it cannot read. An unbound name answers
 * empty rather than zero, because zero is a number and a seller would believe
 * it.
 *
 * Wildcard resolution (ENSIP-10): a parent's resolver is found for any depth of
 * subname, so `worker7.probe.acme.eth` resolves through the resolver set on
 * `acme.eth` without `worker7` ever being registered. The mandate behind a name
 * still has to be named once, by `bind`, because no contract can guess which
 * node a label means.
 */
contract CordonResolver {
    MandateRegistry public immutable registry;
    TreeVault public immutable vault;

    /// @dev ENSIP-10 `IExtendedResolver`.
    bytes4 private constant EXTENDED_RESOLVER = 0x9061b923;
    bytes4 private constant SUPPORTS_INTERFACE = 0x01ffc9a7;
    bytes4 private constant ADDR = 0x3b3b57de; // addr(bytes32)
    bytes4 private constant TEXT = 0x59d1d43c; // text(bytes32,string)

    /// @notice The mandate a name speaks for.
    mapping(bytes32 => bytes32) public nodeOf;

    /**
     * @dev The owner's own words, for the keys no contract can answer.
     *
     * Two kinds of record share this resolver and the difference is the whole
     * point of the split:
     *
     *   COMPUTED — `cordon.live`, `cordon.headroom`, `cordon.boundBy` and the
     *   rest. Read from the registry and the vault while answering. Not stored,
     *   so not capable of drifting, and not writable by anyone including the
     *   owner. A bound is the contract's to state.
     *
     *   STATED — ENSIP-26 `agent-endpoint[<protocol>]` and `agent-context`,
     *   ENSIP-25 `agent-registration[<registry>][<agentId>]`, and ordinary ENS
     *   keys like `avatar` or `url`. Nothing enforces them, they are the owner
     *   describing their own agent, and a resolver that could not carry them
     *   would be a downgrade: an agent with a live bound and no endpoint is one
     *   a caller cannot reach.
     *
     * A stated value may never shadow a computed one — see `setText`. Without
     * that rule the owner could write `cordon.headroom` and a seller reading
     * this resolver would be quoted a figure the vault never agreed to, which
     * is precisely the drift this contract exists to remove.
     */
    mapping(bytes32 => mapping(string => string)) private _stated;

    error NotMandateOwner(bytes32 node, address caller);
    error UnknownName(bytes32 namehash);
    error UnsupportedSelector(bytes4 selector);
    error ComputedKey(string key);
    error NameNotBound(bytes32 namehash);

    event Bound(bytes32 indexed namehash, bytes32 indexed node, address indexed by);
    /// @dev ENS's own event, so an indexer watching resolvers sees these too.
    event TextChanged(bytes32 indexed namehash, string indexed indexedKey, string key, string value);

    constructor(MandateRegistry registry_, TreeVault vault_) {
        registry = registry_;
        vault = vault_;
    }

    /**
     * @notice Point a name at the mandate that bounds it.
     *
     * Only the mandate's owner, and never its operator: an operator that could
     * bind its own name could point it at a wider mandate than the one holding
     * it, and a seller reading that name would be told a bound that does not
     * apply. This is the same split the publishing scripts already enforce —
     * the operator may register beneath itself and may not describe itself.
     */
    function bind(bytes32 namehash, bytes32 node) external {
        MandateRegistry.Mandate memory m = registry.mandate(node);
        if (msg.sender != m.owner) revert NotMandateOwner(node, msg.sender);
        nodeOf[namehash] = node;
        emit Bound(namehash, node, msg.sender);
    }

    /**
     * @notice Write one of the owner's stated records.
     *
     * The owner's, never the operator's, for the same reason `bind` is: an
     * operator that could write its own `agent-endpoint` could point callers at
     * a host the owner never approved, and one that could write
     * `agent-registration` could claim an ERC-8004 identity it does not hold.
     *
     * A key this resolver computes is refused rather than ignored. Silently
     * dropping the write would leave the owner believing they had published a
     * figure, and believing a bound is published when it is not is worse than
     * being told no.
     */
    function setText(bytes32 namehash, string calldata key, string calldata value) external {
        bytes32 node = nodeOf[namehash];
        if (node == bytes32(0)) revert NameNotBound(namehash);
        if (_isComputed(key)) revert ComputedKey(key);

        MandateRegistry.Mandate memory m = registry.mandate(node);
        if (msg.sender != m.owner) revert NotMandateOwner(node, msg.sender);

        _stated[namehash][key] = value;
        emit TextChanged(namehash, key, key, value);
    }

    /// @notice Whether a key is answered by the contracts rather than stored.
    function isComputed(string calldata key) external pure returns (bool) {
        return _isComputed(key);
    }

    function _isComputed(string memory key) private pure returns (bool) {
        bytes32 k = keccak256(bytes(key));
        return k == keccak256("cordon.node") || k == keccak256("cordon.registry")
            || k == keccak256("cordon.vault") || k == keccak256("cordon.live")
            || k == keccak256("cordon.revokedAt") || k == keccak256("cordon.headroom")
            || k == keccak256("cordon.boundBy") || k == keccak256("cordon.budget")
            || k == keccak256("cordon.owner") || k == keccak256("cordon.depth");
    }

    /* ------------------------------------------------------------------ */
    /* ENSIP-10                                                            */
    /* ------------------------------------------------------------------ */

    /**
     * @notice Resolve `data` for the DNS-encoded `name`.
     *
     * The namehash is computed from the wire-format name rather than taken as
     * an argument, because that is what makes one resolver serve a subtree: the
     * caller hands over the whole name and this decides which node it is.
     */
    /**
     * @notice The node a wire-format name resolves to.
     *
     * Exposed because the agreement between the DNS encoding a resolver is
     * handed and the EIP-137 namehash a reader computes is the thing that makes
     * wildcard resolution safe, and an agreement that is never checked is one
     * nothing would catch if it broke.
     */
    function resolveNamehash(bytes calldata name) external pure returns (bytes32) {
        return _namehash(name, 0);
    }

    function resolve(bytes calldata name, bytes calldata data)
        external
        view
        returns (bytes memory)
    {
        bytes32 namehash = _namehash(name, 0);
        bytes4 selector = bytes4(data[:4]);

        if (selector == ADDR) {
            return abi.encode(addr(namehash));
        }
        if (selector == TEXT) {
            (, string memory key) = abi.decode(data[4:], (bytes32, string));
            return abi.encode(text(namehash, key));
        }
        revert UnsupportedSelector(selector);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == EXTENDED_RESOLVER || interfaceId == SUPPORTS_INTERFACE;
    }

    /* ------------------------------------------------------------------ */
    /* The records, computed on every read                                 */
    /* ------------------------------------------------------------------ */

    /// @notice The operator key that signs for this agent, from the mandate.
    function addr(bytes32 namehash) public view returns (address) {
        bytes32 node = nodeOf[namehash];
        if (node == bytes32(0)) return address(0);
        return registry.mandate(node).operator;
    }

    /**
     * @notice A Cordon record, answered from the contracts as of this block.
     *
     * Keys:
     *   cordon.node       the mandate id, so a reader can go and check
     *   cordon.registry   where to check it
     *   cordon.vault      where the money is
     *   cordon.live       "true", or "revoked" — read from revokedAt, now
     *   cordon.revokedAt  which ancestor's cut killed it, empty when live
     *   cordon.headroom   what it may still draw, in USDC, now
     *   cordon.boundBy    the node whose limit produces that figure
     *   cordon.budget     the node's own window budget
     *   cordon.owner      the human who funded the tree and can cut it
     *   cordon.depth      how far from the root it sits
     *
     * An unknown key answers empty, as a resolver should. An unbound name
     * answers empty for every key — not "0", which reads like a bound.
     */
    function text(bytes32 namehash, string memory key) public view returns (string memory) {
        bytes32 node = nodeOf[namehash];
        if (node == bytes32(0)) return "";

        bytes32 k = keccak256(bytes(key));

        if (k == keccak256("cordon.node")) return _hex32(node);
        if (k == keccak256("cordon.registry")) return _hex20(address(registry));
        if (k == keccak256("cordon.vault")) return _hex20(address(vault));

        if (k == keccak256("cordon.live")) {
            return registry.revokedAt(node) == bytes32(0) ? "true" : "revoked";
        }
        if (k == keccak256("cordon.revokedAt")) {
            bytes32 cut = registry.revokedAt(node);
            return cut == bytes32(0) ? "" : _hex32(cut);
        }

        if (k == keccak256("cordon.headroom")) {
            (uint128 available6,) = vault.headroom(node);
            return _usdc(available6);
        }
        if (k == keccak256("cordon.boundBy")) {
            (, bytes32 boundBy) = vault.headroom(node);
            return boundBy == bytes32(0) ? "" : _hex32(boundBy);
        }

        if (
            k == keccak256("cordon.budget") || k == keccak256("cordon.owner")
                || k == keccak256("cordon.depth")
        ) {
            MandateRegistry.Mandate memory m = registry.mandate(node);
            if (k == keccak256("cordon.budget")) return _usdc(m.budget6);
            if (k == keccak256("cordon.owner")) return _hex20(m.owner);
            return _uint(m.depth);
        }

        /* Everything else is the owner's own words, or absent. ENSIP-26's
           `agent-endpoint[mcp]` and `agent-context` and ENSIP-25's
           `agent-registration[...]` arrive here, as do ordinary ENS keys. An
           unset key answers empty, which is what a resolver should say. */
        return _stated[namehash][key];
    }

    /* ------------------------------------------------------------------ */
    /* Wire-format name -> namehash (EIP-137, over the DNS encoding)        */
    /* ------------------------------------------------------------------ */

    /**
     * @dev Recursive namehash over a length-prefixed name. A zero-length label
     *      is the root, whose hash is 32 zero bytes.
     */
    function _namehash(bytes calldata name, uint256 offset) private pure returns (bytes32) {
        uint256 length = uint8(name[offset]);
        if (length == 0) return bytes32(0);
        bytes32 label = keccak256(name[offset + 1:offset + 1 + length]);
        return keccak256(abi.encodePacked(_namehash(name, offset + 1 + length), label));
    }

    /* ------------------------------------------------------------------ */
    /* Formatting — strings, because a text record is a string              */
    /* ------------------------------------------------------------------ */

    /// @dev Six decimals, always, because that is what the token has. No
    ///      rounding: this is money, and the direction that flatters is the one
    ///      to refuse.
    function _usdc(uint128 base6) private pure returns (string memory) {
        bytes memory frac = new bytes(6);
        uint256 rest = base6 % 1_000_000;
        for (uint256 i = 6; i > 0; --i) {
            frac[i - 1] = bytes1(uint8(48 + (rest % 10)));
            rest /= 10;
        }
        return string.concat(_uint(base6 / 1_000_000), ".", string(frac));
    }

    function _uint(uint256 value) private pure returns (string memory) {
        if (value == 0) return "0";
        uint256 digits;
        for (uint256 v = value; v != 0; v /= 10) ++digits;
        bytes memory out = new bytes(digits);
        for (uint256 v = value; v != 0; v /= 10) out[--digits] = bytes1(uint8(48 + (v % 10)));
        return string(out);
    }

    bytes16 private constant HEX = "0123456789abcdef";

    function _hex32(bytes32 value) private pure returns (string memory) {
        bytes memory out = new bytes(66);
        out[0] = "0";
        out[1] = "x";
        for (uint256 i = 0; i < 32; ++i) {
            out[2 + i * 2] = HEX[uint8(value[i]) >> 4];
            out[3 + i * 2] = HEX[uint8(value[i]) & 0x0f];
        }
        return string(out);
    }

    function _hex20(address value) private pure returns (string memory) {
        bytes20 raw = bytes20(value);
        bytes memory out = new bytes(42);
        out[0] = "0";
        out[1] = "x";
        for (uint256 i = 0; i < 20; ++i) {
            out[2 + i * 2] = HEX[uint8(raw[i]) >> 4];
            out[3 + i * 2] = HEX[uint8(raw[i]) & 0x0f];
        }
        return string(out);
    }
}
