// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * MandateRegistry — the delegation tree.
 *
 * One budget for a tree of agents. This contract owns the shape of the tree
 * and the rule that a child can only ever be narrower than its parent.
 * TreeVault owns the money and the arithmetic.
 *
 * There is no admin key, no proxy and no supervisor role. Nothing here can be
 * upgraded, paused or reversed by its deployer, and the deployer is not stored.
 * A refusal that its authors can undo is not a control.
 */
contract MandateRegistry {
    /* ------------------------------------------------------------------ */
    /* Types                                                               */
    /* ------------------------------------------------------------------ */

    struct Mandate {
        bytes32 parent; // 0 at the root
        bytes32 root; // self at the root
        address owner; // the human. Set at the root, inherited, immutable
        address operator; // the daemon key permitted to draw for this node
        uint128 budget6; // trailing-window budget, 6-decimal base units
        uint128 lifetimeCap6; // total for the life of the mandate; never resets
        uint64 windowSeconds; // equal at every depth, never smaller than the parent
        uint128 trancheCap6; // per-draw cap
        uint16 concentrationBps; // share of the window one counterparty may take
        uint8 depth; // 0 at the root
        uint8 maxDepth; // set at the root, inherited, never raised
        bool revoked;
        bool exists;
        uint64 createdAt;
    }

    struct Params {
        address operator;
        uint128 budget6;
        uint128 lifetimeCap6;
        uint64 windowSeconds;
        uint128 trancheCap6;
        uint16 concentrationBps;
        uint8 maxDepth; // ignored for children, which inherit the root's
    }

    uint16 public constant BPS = 10_000;

    /* ------------------------------------------------------------------ */
    /* Storage                                                             */
    /* ------------------------------------------------------------------ */

    mapping(bytes32 => Mandate) private _mandates;
    mapping(address => uint96) private _rootNonce;
    mapping(bytes32 => uint96) private _childNonce;

    /* ------------------------------------------------------------------ */
    /* Errors — auth and nonsense revert. Bounds do not; they refuse.       */
    /* ------------------------------------------------------------------ */

    error UnknownMandate(bytes32 node);
    error NotOwner();
    error NotParentOperator();
    error ParentRevoked(bytes32 node);
    error DepthExceeded(uint8 attempted, uint8 max);
    error NotNarrowing(string field);
    error WindowMustEqualParent(uint64 child, uint64 parent);
    error ZeroOperator();
    error ZeroBudget();
    error ZeroLifetimeCap();
    error ConcentrationOutOfRange(uint16 bps);

    /* ------------------------------------------------------------------ */
    /* Events — the chain is the log, so every state change emits one.      */
    /* ------------------------------------------------------------------ */

    event MandateOpened(
        bytes32 indexed node,
        address indexed owner,
        address indexed operator,
        uint128 budget6,
        uint128 lifetimeCap6,
        uint64 windowSeconds,
        uint8 maxDepth
    );
    event MandateSpawned(
        bytes32 indexed node, bytes32 indexed parent, address indexed operator, uint128 budget6, uint128 lifetimeCap6, uint8 depth
    );
    event MandateRevoked(bytes32 indexed node, address indexed by);

    /* ------------------------------------------------------------------ */
    /* Opening a root                                                      */
    /* ------------------------------------------------------------------ */

    /// @notice The owner opens a root mandate from their own key. This is the
    ///         one moment a human authorises the tree, and no server can
    ///         perform it on their behalf.
    function open(Params calldata p) external returns (bytes32 node) {
        if (p.operator == address(0)) revert ZeroOperator();
        if (p.budget6 == 0) revert ZeroBudget();
        /* A mandate with no lifetime cap is the defect this field exists to
           close: a window budget on its own is a rate, and a tree left running
           spends it again every window. Zero is not "unlimited" here. */
        if (p.lifetimeCap6 == 0) revert ZeroLifetimeCap();
        if (p.concentrationBps == 0 || p.concentrationBps > BPS) {
            revert ConcentrationOutOfRange(p.concentrationBps);
        }
        if (p.windowSeconds == 0) revert WindowMustEqualParent(0, 0);
        if (p.maxDepth == 0) revert DepthExceeded(0, 0);

        node = keccak256(abi.encode(block.chainid, address(this), msg.sender, _rootNonce[msg.sender]++));

        _mandates[node] = Mandate({
            parent: bytes32(0),
            root: node,
            owner: msg.sender,
            operator: p.operator,
            budget6: p.budget6,
            lifetimeCap6: p.lifetimeCap6,
            windowSeconds: p.windowSeconds,
            trancheCap6: p.trancheCap6,
            concentrationBps: p.concentrationBps,
            depth: 0,
            maxDepth: p.maxDepth,
            revoked: false,
            exists: true,
            createdAt: uint64(block.timestamp)
        });

        emit MandateOpened(node, msg.sender, p.operator, p.budget6, p.lifetimeCap6, p.windowSeconds, p.maxDepth);
    }

    /* ------------------------------------------------------------------ */
    /* Spawning a child                                                    */
    /* ------------------------------------------------------------------ */

    /**
     * @notice A parent may create a child without an owner signature.
     *
     * Spawns happen in seconds while the owner sleeps, so a per-spawn approval
     * is not a control anyone can operate. Safety comes from structure
     * instead: this function refuses a child wider than its parent no matter
     * who asks, including the owner.
     */
    function spawn(bytes32 parent, Params calldata p) external returns (bytes32 node) {
        Mandate storage m = _mandates[parent];
        if (!m.exists) revert UnknownMandate(parent);
        if (msg.sender != m.operator && msg.sender != m.owner) revert NotParentOperator();
        if (!isLive(parent)) revert ParentRevoked(parent);
        if (p.operator == address(0)) revert ZeroOperator();
        if (p.budget6 == 0) revert ZeroBudget();
        if (p.lifetimeCap6 == 0) revert ZeroLifetimeCap();

        uint8 depth = m.depth + 1;
        if (depth > m.maxDepth) revert DepthExceeded(depth, m.maxDepth);

        // Narrowing, monotonically. Each of these is an attack if it bends.
        if (p.budget6 > m.budget6) revert NotNarrowing("budget6");
        if (p.lifetimeCap6 > m.lifetimeCap6) revert NotNarrowing("lifetimeCap6");
        if (p.trancheCap6 > m.trancheCap6) revert NotNarrowing("trancheCap6");
        if (p.concentrationBps > m.concentrationBps) revert NotNarrowing("concentrationBps");
        if (p.concentrationBps == 0) revert ConcentrationOutOfRange(0);

        // Equal, not merely smaller. A shorter child window resets faster than
        // the parent it debits, which turns the parent's budget into a rate.
        if (p.windowSeconds != m.windowSeconds) revert WindowMustEqualParent(p.windowSeconds, m.windowSeconds);

        node = keccak256(abi.encode(parent, _childNonce[parent]++));

        _mandates[node] = Mandate({
            parent: parent,
            root: m.root,
            owner: m.owner,
            operator: p.operator,
            budget6: p.budget6,
            lifetimeCap6: p.lifetimeCap6,
            windowSeconds: p.windowSeconds,
            trancheCap6: p.trancheCap6,
            concentrationBps: p.concentrationBps,
            depth: depth,
            maxDepth: m.maxDepth,
            revoked: false,
            exists: true,
            createdAt: uint64(block.timestamp)
        });

        emit MandateSpawned(node, parent, p.operator, p.budget6, p.lifetimeCap6, depth);
    }

    /* ------------------------------------------------------------------ */
    /* Revocation — one transaction cuts a branch and every descendant      */
    /* ------------------------------------------------------------------ */

    /**
     * @notice Cut a node. Every descendant dies with it, in this one
     *         transaction and at constant cost, because liveness is read by
     *         walking to the root rather than by enumerating children.
     */
    function revoke(bytes32 node) external {
        Mandate storage m = _mandates[node];
        if (!m.exists) revert UnknownMandate(node);
        if (msg.sender != m.owner && !_isStrictAncestorOperator(node, msg.sender)) revert NotOwner();
        m.revoked = true;
        emit MandateRevoked(node, msg.sender);
    }

    /* ------------------------------------------------------------------ */
    /* Views                                                               */
    /* ------------------------------------------------------------------ */

    function mandate(bytes32 node) external view returns (Mandate memory) {
        Mandate memory m = _mandates[node];
        if (!m.exists) revert UnknownMandate(node);
        return m;
    }

    function exists(bytes32 node) external view returns (bool) {
        return _mandates[node].exists;
    }

    /// @notice The node and every ancestor, root last. Bounded by maxDepth.
    function path(bytes32 node) public view returns (bytes32[] memory out) {
        Mandate storage m = _mandates[node];
        if (!m.exists) revert UnknownMandate(node);
        out = new bytes32[](uint256(m.depth) + 1);
        bytes32 cursor = node;
        for (uint256 i = 0; i <= m.depth; ++i) {
            out[i] = cursor;
            cursor = _mandates[cursor].parent;
        }
    }

    /// @notice False if this node or any ancestor has been revoked.
    function isLive(bytes32 node) public view returns (bool) {
        Mandate storage m = _mandates[node];
        if (!m.exists) return false;
        bytes32 cursor = node;
        for (uint256 i = 0; i <= m.depth; ++i) {
            if (_mandates[cursor].revoked) return false;
            cursor = _mandates[cursor].parent;
        }
        return true;
    }

    /// @notice The first revoked node on the path, or 0 if the branch is live.
    function revokedAt(bytes32 node) external view returns (bytes32) {
        Mandate storage m = _mandates[node];
        if (!m.exists) return bytes32(0);
        bytes32 cursor = node;
        for (uint256 i = 0; i <= m.depth; ++i) {
            if (_mandates[cursor].revoked) return cursor;
            cursor = _mandates[cursor].parent;
        }
        return bytes32(0);
    }

    function _isStrictAncestorOperator(bytes32 node, address who) private view returns (bool) {
        bytes32 cursor = _mandates[node].parent;
        for (uint256 i = 0; i < _mandates[node].depth; ++i) {
            if (_mandates[cursor].operator == who) return true;
            cursor = _mandates[cursor].parent;
        }
        return false;
    }
}
