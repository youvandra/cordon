// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "./interfaces/IERC20.sol";
import {SafeTransfer} from "./SafeTransfer.sol";
import {MandateRegistry} from "./MandateRegistry.sol";

/**
 * TreeVault — the money and the arithmetic.
 *
 * The vault is the only funding source in the system. Every agent key holds
 * zero balance; a draw moves USDC from here to the counterparty directly, so
 * the maximum unsupervised spend is bounded by this contract and not by a
 * tranche somebody already holds.
 *
 * The headline mechanism is in `_evaluate`: a draw at any node debits the
 * trailing window of that node **and of every ancestor up to the root**.
 * Without that, delegation is the bypass and every other bound is decoration.
 *
 * Two properties are load bearing and easy to lose:
 *
 *  1. A refused draw RETURNS. It never reverts. A revert rolls back the event
 *     and a refusal that leaves no trace is not a record — and the record is
 *     the product.
 *  2. A refusal consumes no budget. Window state is untouched on the refusing
 *     path, so a refusal cannot be used to burn down a rival branch's budget.
 *
 * There is no admin key, no proxy, and no supervisor role. The deployer is not
 * stored and has no powers. Nothing can erase a refusal, including the owner:
 * `release` adds a signed human exception on top of the record, it does not
 * remove the refusal that provoked it.
 *
 * Decimals: this contract speaks only the 6-decimal ERC-20 view of USDC. It has
 * no `receive` and no `fallback`, so the 18-decimal native view cannot enter it
 * and the two views never mix here. Scaling lives in exactly one function, in
 * `packages/fixtures`.
 */
contract TreeVault {
    using SafeTransfer for IERC20;

    /* ------------------------------------------------------------------ */
    /* Types                                                               */
    /* ------------------------------------------------------------------ */

    enum Reason {
        None,
        Revoked,
        TrancheCap,
        WindowBudget,
        Concentration,
        VaultBalance
    }

    /// @dev A tumbling window advanced by whole multiples, so equal-length
    ///      windows on a parent and a child stay in phase forever.
    struct Window {
        uint64 start;
        uint128 spent;
    }

    struct Refusal {
        bytes32 node; // where the draw was attempted
        bytes32 breachedAt; // which node's bound stopped it — often an ancestor
        address payee;
        uint128 amount6;
        Reason reason;
        uint64 at;
        bool released; // a named human signed an exception, later, on chain
    }

    uint16 private constant BPS = 10_000;

    /* ------------------------------------------------------------------ */
    /* Immutables — set once at deployment, addresses live in deployments/  */
    /* ------------------------------------------------------------------ */

    IERC20 public immutable usdc;
    MandateRegistry public immutable registry;

    /* ------------------------------------------------------------------ */
    /* Storage                                                             */
    /* ------------------------------------------------------------------ */

    /// @notice Funds are held per root, never commingled across trees.
    mapping(bytes32 => uint128) public treasury6;

    mapping(bytes32 => Window) private _nodeWindow;
    mapping(bytes32 => mapping(address => Window)) private _payeeWindow;

    Refusal[] private _refusals;

    /* ------------------------------------------------------------------ */
    /* Errors — auth and nonsense revert. Bounds refuse instead.            */
    /* ------------------------------------------------------------------ */

    error NotOperator(bytes32 node, address caller);
    error NotOwner(bytes32 root, address caller);
    error NotARoot(bytes32 node);
    error ZeroAmount();
    error ZeroPayee();
    error InsufficientTreasury(bytes32 root, uint128 have, uint128 want);
    error UnknownRefusal(uint256 id);
    error AlreadyReleased(uint256 id);

    /* ------------------------------------------------------------------ */
    /* Events — Arc events are the log. Postgres is a rebuildable cache.    */
    /* ------------------------------------------------------------------ */

    event Funded(bytes32 indexed root, address indexed from, uint128 amount6);
    event Withdrawn(bytes32 indexed root, address indexed to, uint128 amount6);
    event Drawn(bytes32 indexed node, address indexed payee, uint128 amount6, bytes32 indexed root);
    event AncestorDebited(bytes32 indexed node, bytes32 indexed ancestor, uint128 amount6, uint128 spent6, uint128 budget6);
    event Refused(
        uint256 indexed refusalId, bytes32 indexed node, bytes32 indexed breachedAt, address payee, uint128 amount6, Reason reason
    );
    event Released(uint256 indexed refusalId, address indexed by, address indexed payee, uint128 amount6);

    constructor(IERC20 usdc_, MandateRegistry registry_) {
        usdc = usdc_;
        registry = registry_;
    }

    /* ------------------------------------------------------------------ */
    /* Funding                                                             */
    /* ------------------------------------------------------------------ */

    /// @notice Fund a tree. Anyone may pay in; only the owner may take out.
    function fund(bytes32 root, uint128 amount6) external {
        MandateRegistry.Mandate memory m = registry.mandate(root);
        if (m.depth != 0) revert NotARoot(root);
        if (amount6 == 0) revert ZeroAmount();
        usdc.pull(msg.sender, address(this), amount6);
        treasury6[root] += amount6;
        emit Funded(root, msg.sender, amount6);
    }

    function withdraw(bytes32 root, address to, uint128 amount6) external {
        MandateRegistry.Mandate memory m = registry.mandate(root);
        if (m.depth != 0) revert NotARoot(root);
        if (msg.sender != m.owner) revert NotOwner(root, msg.sender);
        uint128 have = treasury6[root];
        if (amount6 > have) revert InsufficientTreasury(root, have, amount6);
        treasury6[root] = have - amount6;
        usdc.send(to, amount6);
        emit Withdrawn(root, to, amount6);
    }

    /* ------------------------------------------------------------------ */
    /* The draw                                                            */
    /* ------------------------------------------------------------------ */

    /**
     * @notice Release `amount6` to `payee` on behalf of `node`, or refuse.
     *
     * The counterparty and the notional are not claims the caller makes about
     * the payment — they ARE the payment. `payee` receives the money and
     * `amount6` is what leaves the vault, so neither can be spoofed to dodge
     * the concentration bound. A value the caller controls is not a constraint;
     * a value that is the transfer itself is one.
     *
     * @return released true when the money moved
     * @return refusalId 0 when released, otherwise the id of the record
     * @return reason    which bound stopped it
     */
    function draw(bytes32 node, address payee, uint128 amount6)
        external
        returns (bool released, uint256 refusalId, Reason reason)
    {
        MandateRegistry.Mandate memory m = registry.mandate(node);
        if (msg.sender != m.operator) revert NotOperator(node, msg.sender);
        if (amount6 == 0) revert ZeroAmount();
        if (payee == address(0)) revert ZeroPayee();

        bytes32[] memory ancestry = registry.path(node);

        bytes32 breachedAt;
        (reason, breachedAt) = _evaluate(node, m, ancestry, payee, amount6);

        if (reason != Reason.None) {
            // No window is touched here. A refusal consumes no budget.
            _refusals.push(
                Refusal({
                    node: node,
                    breachedAt: breachedAt,
                    payee: payee,
                    amount6: amount6,
                    reason: reason,
                    at: uint64(block.timestamp),
                    released: false
                })
            );
            refusalId = _refusals.length;
            emit Refused(refusalId, node, breachedAt, payee, amount6, reason);
            return (false, refusalId, reason);
        }

        _commit(ancestry, payee, amount6);
        treasury6[m.root] -= amount6;
        usdc.send(payee, amount6);
        emit Drawn(node, payee, amount6, m.root);
        return (true, 0, Reason.None);
    }

    /**
     * @dev Evaluate every bound before any of them is written. The whole path
     *      is checked, not just the node: a grandchild's draw is measured
     *      against its grandparent's remaining window, which is the one thing
     *      no per-agent wallet and no per-session limit can do.
     */
    function _evaluate(
        bytes32 node,
        MandateRegistry.Mandate memory m,
        bytes32[] memory ancestry,
        address payee,
        uint128 amount6
    ) private view returns (Reason, bytes32) {
        // A revoked ancestor kills the branch. This is a refusal, not a revert,
        // because an agent still trying to spend under a cut mandate is exactly
        // the conduct the record exists to hold.
        bytes32 cut = registry.revokedAt(node);
        if (cut != bytes32(0)) return (Reason.Revoked, cut);

        for (uint256 i = 0; i < ancestry.length; ++i) {
            MandateRegistry.Mandate memory a =
                i == 0 ? m : registry.mandate(ancestry[i]);

            if (amount6 > a.trancheCap6) return (Reason.TrancheCap, ancestry[i]);

            uint128 spent = _spent(_nodeWindow[ancestry[i]], a.windowSeconds);
            if (spent + amount6 > a.budget6) return (Reason.WindowBudget, ancestry[i]);

            uint128 toPayee = _spent(_payeeWindow[ancestry[i]][payee], a.windowSeconds);
            uint128 limit = uint128((uint256(a.budget6) * a.concentrationBps) / BPS);
            if (toPayee + amount6 > limit) return (Reason.Concentration, ancestry[i]);
        }

        if (treasury6[m.root] < amount6) return (Reason.VaultBalance, m.root);

        return (Reason.None, bytes32(0));
    }

    /// @dev Ancestor debit. Every node on the path pays for this draw.
    function _commit(bytes32[] memory ancestry, address payee, uint128 amount6) private {
        for (uint256 i = 0; i < ancestry.length; ++i) {
            bytes32 id = ancestry[i];
            MandateRegistry.Mandate memory a = registry.mandate(id);

            Window memory w = _roll(_nodeWindow[id], a.windowSeconds);
            w.spent += amount6;
            _nodeWindow[id] = w;

            Window memory pw = _roll(_payeeWindow[id][payee], a.windowSeconds);
            pw.spent += amount6;
            _payeeWindow[id][payee] = pw;

            emit AncestorDebited(ancestry[0], id, amount6, w.spent, a.budget6);
        }
    }

    /* ------------------------------------------------------------------ */
    /* Release — the human exit, and it is logged                          */
    /* ------------------------------------------------------------------ */

    /**
     * @notice A named human signs a one-time exception to a specific refusal.
     *
     * This does not raise a bound, re-run a draw, or erase anything. The
     * refusal stays on chain forever and the release is recorded beside it, so
     * the conduct record counts overrides as well as breaches. What cannot be
     * reversed is the bound; the decision is a person's, and it has their
     * signature on it.
     *
     * Deliberately: the released amount does NOT consume window budget,
     * because it was never inside the window's authority to begin with.
     */
    function release(uint256 refusalId) external {
        if (refusalId == 0 || refusalId > _refusals.length) revert UnknownRefusal(refusalId);
        Refusal storage r = _refusals[refusalId - 1];
        if (r.released) revert AlreadyReleased(refusalId);

        MandateRegistry.Mandate memory m = registry.mandate(r.node);
        if (msg.sender != m.owner) revert NotOwner(m.root, msg.sender);

        uint128 have = treasury6[m.root];
        if (r.amount6 > have) revert InsufficientTreasury(m.root, have, r.amount6);

        r.released = true;
        treasury6[m.root] = have - r.amount6;
        usdc.send(r.payee, r.amount6);
        emit Released(refusalId, msg.sender, r.payee, r.amount6);
    }

    /* ------------------------------------------------------------------ */
    /* Views — every figure the console renders comes from one of these     */
    /* ------------------------------------------------------------------ */

    /// @notice `TreeVault.windowSpent(node)` — the budget figure on screen.
    function windowSpent(bytes32 node) external view returns (uint128) {
        MandateRegistry.Mandate memory m = registry.mandate(node);
        return _spent(_nodeWindow[node], m.windowSeconds);
    }

    /// @notice What a draw at `node` would do to every ancestor. The tree bar.
    function ancestorDebit(bytes32 node, uint128 amount6)
        external
        view
        returns (bytes32[] memory nodes, uint128[] memory spentAfter6, uint128[] memory budget6)
    {
        nodes = registry.path(node);
        spentAfter6 = new uint128[](nodes.length);
        budget6 = new uint128[](nodes.length);
        for (uint256 i = 0; i < nodes.length; ++i) {
            MandateRegistry.Mandate memory a = registry.mandate(nodes[i]);
            spentAfter6[i] = _spent(_nodeWindow[nodes[i]], a.windowSeconds) + amount6;
            budget6[i] = a.budget6;
        }
    }

    /**
     * @notice What `node` may still draw in this window, in total.
     *
     * A node's own budget is an upper bound, not an amount. A grandchild with
     * $30 of its own window untouched can still draw nothing, because the root
     * two levels above it is full — and a surface that shows the $30 is
     * telling the owner something the contract will not honour.
     *
     * So this returns the tightest remaining window on the whole path, capped
     * by what the tree actually holds, together with the node that binds it.
     * Concentration is deliberately not folded in: it limits how the headroom
     * may be *distributed* between counterparties, not how much there is. Ask
     * `concentrationBound` for a specific seller.
     *
     * @return available6 the most this node could still draw, all sellers
     * @return boundBy    the node whose limit produces that figure
     */
    function headroom(bytes32 node) public view returns (uint128 available6, bytes32 boundBy) {
        MandateRegistry.Mandate memory m = registry.mandate(node);

        bytes32 cut = registry.revokedAt(node);
        if (cut != bytes32(0)) return (0, cut);

        bytes32[] memory ancestry = registry.path(node);
        available6 = type(uint128).max;

        for (uint256 i = 0; i < ancestry.length; ++i) {
            MandateRegistry.Mandate memory a =
                i == 0 ? m : registry.mandate(ancestry[i]);
            uint128 left = a.budget6 - _spent(_nodeWindow[ancestry[i]], a.windowSeconds);
            if (left < available6) {
                available6 = left;
                boundBy = ancestry[i];
            }
        }

        uint128 funded = treasury6[m.root];
        if (funded < available6) {
            available6 = funded;
            boundBy = m.root;
        }
    }

    /// @notice `TreeVault.concentrationBound(node, counterparty)`.
    function concentrationBound(bytes32 node, address counterparty)
        external
        view
        returns (uint128 spent6, uint128 limit6)
    {
        MandateRegistry.Mandate memory m = registry.mandate(node);
        spent6 = _spent(_payeeWindow[node][counterparty], m.windowSeconds);
        limit6 = uint128((uint256(m.budget6) * m.concentrationBps) / BPS);
    }

    /// @notice What `draw` would answer right now, without changing anything.
    function evaluate(bytes32 node, address payee, uint128 amount6)
        external
        view
        returns (Reason reason, bytes32 breachedAt)
    {
        MandateRegistry.Mandate memory m = registry.mandate(node);
        return _evaluate(node, m, registry.path(node), payee, amount6);
    }

    function refusal(uint256 id) external view returns (Refusal memory) {
        if (id == 0 || id > _refusals.length) revert UnknownRefusal(id);
        return _refusals[id - 1];
    }

    function refusalCount() external view returns (uint256) {
        return _refusals.length;
    }

    /* ------------------------------------------------------------------ */
    /* Window arithmetic                                                   */
    /* ------------------------------------------------------------------ */

    /// @dev Advance by whole windows so a parent and an equal-length child
    ///      never drift out of phase, then report what is spent in the window
    ///      that contains `block.timestamp`.
    function _roll(Window memory w, uint64 windowSeconds) private view returns (Window memory) {
        if (w.start == 0) return Window({start: uint64(block.timestamp), spent: 0});
        if (block.timestamp < uint256(w.start) + windowSeconds) return w;
        uint64 elapsed = uint64(block.timestamp) - w.start;
        return Window({start: w.start + (elapsed / windowSeconds) * windowSeconds, spent: 0});
    }

    function _spent(Window memory w, uint64 windowSeconds) private view returns (uint128) {
        return _roll(w, windowSeconds).spent;
    }
}
