// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {CordonResolver} from "../../src/CordonResolver.sol";
import {MandateRegistry} from "../../src/MandateRegistry.sol";
import {IUserRegistry} from "./IEns.sol";

/**
 * Bring a subname under the tree's computing resolver.
 *
 * Wildcard resolution is often described as "one resolver serves the whole
 * subtree", and that sentence hides the half that matters. ENSIP-10 decides
 * which resolver is *found* for a subname; it does not decide what that
 * resolver answers. `CordonResolver.resolve` hashes the whole name it is
 * handed and looks the node up in `nodeOf`, so a subname nobody bound hashes
 * to a namehash mapped to zero and every record comes back empty.
 *
 * Empty is the worst of the three possible answers. A revoked agent says
 * `revoked`, an unknown key says nothing, and a name that was never bound also
 * says nothing — so a seller cannot tell "this agent has no bound" from "this
 * agent is fine and I asked the wrong resolver".
 *
 * That was the state of `probe.mira.eth` after the 26 September redeploy: the
 * tree's root name answered `cordon.live` and `cordon.headroom` from the
 * contracts, and the agent name underneath it — the one a stranger actually
 * resolves — answered nothing at all.
 *
 * Three steps, because all three are needed and any one alone leaves a name
 * that reads as unbounded:
 *
 *   1. `bind` the subname's namehash to its own mandate. Its own, never the
 *      root's: a subname pointed at the root would quote a seller the root's
 *      headroom, which is the wider figure and the wrong one.
 *   2. Carry the owner's stated records across. The computed keys need no
 *      copying — this resolver answers all ten of them from the contracts.
 *   3. Clear the resolver set on the subname itself. A resolver on the name
 *      wins over the parent's wildcard, so until this is done the old stored
 *      records keep answering and nothing above is reached.
 *
 * Run after `DeployResolver`.
 */
contract BindSubname is Script {
    function run() external {
        CordonResolver resolver = CordonResolver(vm.envAddress("CORDON_RESOLVER"));
        MandateRegistry registry = MandateRegistry(vm.envAddress("CORDON_REGISTRY"));
        bytes32 namehash = vm.envBytes32("ENS_NAMEHASH");
        bytes32 node = vm.envBytes32("CORDON_PROBE_NODE");

        address nameRegistry = vm.envAddress("ENS_SUBREGISTRY");
        uint256 tokenId = vm.envUint("ENS_SUB_TOKEN_ID");

        MandateRegistry.Mandate memory m = registry.mandate(node);
        require(m.exists, "no such mandate");

        vm.startBroadcast();

        resolver.bind(namehash, node);

        /* The owner's own words, which the contracts cannot answer. Optional:
           a name resolves without them and a caller simply has no endpoint. */
        string memory endpoint = vm.envOr("ENS_ENDPOINT_MCP", string(""));
        if (bytes(endpoint).length != 0) {
            resolver.setText(namehash, "agent-endpoint[mcp]", endpoint);
        }
        string memory context = vm.envOr("ENS_AGENT_CONTEXT", string(""));
        if (bytes(context).length != 0) {
            resolver.setText(namehash, "agent-context", context);
        }

        /* Last, so the name is never between resolvers: until this call the
           old one still answers, and after it the parent's wildcard does. */
        IUserRegistry(nameRegistry).setResolver(tokenId, address(0));

        vm.stopBroadcast();

        console.log("resolver        ", address(resolver));
        console.log("node");
        console.logBytes32(node);
        console.log("addr            ", resolver.addr(namehash));
        console.log("cordon.live     ", resolver.text(namehash, "cordon.live"));
        console.log("cordon.headroom ", resolver.text(namehash, "cordon.headroom"));
        console.log("cordon.boundBy  ", resolver.text(namehash, "cordon.boundBy"));
        console.log("endpoint        ", resolver.text(namehash, "agent-endpoint[mcp]"));
        console.log("The subname's own resolver is cleared; the tree's now answers for it.");
    }
}
