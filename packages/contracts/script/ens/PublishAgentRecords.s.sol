// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MandateRegistry} from "../../src/MandateRegistry.sol";
import {ConductRecord} from "../../src/ConductRecord.sol";
import {
    IVerifiableFactory,
    IPermissionedResolver,
    IUserRegistry,
    EnsResolverRoles
} from "./IEns.sol";

/**
 * Everything an agent publishes about itself, written by its owner.
 *
 * Four kinds of record, and the difference between them is what a reader may
 * trust:
 *
 *   ENSIP-26 `agent-endpoint[<protocol>]` — where to call it. A URL, and the
 *   name is what changes when the daemon moves host. Callers do nothing.
 *
 *   ENSIP-26 `agent-context` — what it is for, in a form an agentic system can
 *   read. Stated by its owner and enforced by nothing, which is said in the
 *   text itself rather than left to be assumed.
 *
 *   ENSIP-25 `agent-registration[<registry>][<agentId>]` — the ERC-8004
 *   identity this name claims. The value carries no meaning; its presence is
 *   the owner attesting that the name and the registry entry are the same
 *   agent. The link is checkable from the other side too: `ConductRecord.bind`
 *   refused to make it unless the identity was held by this node's operator.
 *
 *   `cordon.node` and `cordon.registry` — a pointer to the bound. Never the
 *   bound itself.
 *
 * **The agentId is read from the chain, not passed in.** A registration record
 * naming an identity the node is not bound to would be an owner attesting to
 * something no contract agrees with, which is the cosmetic failure in its
 * purest form.
 */
contract PublishAgentRecords is Script {
    function run() external {
        MandateRegistry registry = MandateRegistry(vm.envAddress("CORDON_REGISTRY"));
        ConductRecord record = ConductRecord(vm.envAddress("CORDON_RECORD"));
        bytes32 node = vm.envBytes32("CORDON_BIND_NODE");
        bytes32 namehash = vm.envBytes32("ENS_BIND_NAMEHASH");
        address nameRegistry = vm.envAddress("ENS_BIND_REGISTRY");
        uint256 tokenId = vm.envUint("ENS_BIND_TOKEN_ID");

        MandateRegistry.Mandate memory m = registry.mandate(node);
        require(m.exists, "no such mandate");

        uint256 agentId = record.agentIdOf(node);
        require(agentId != 0, "this node is bound to no identity; bind it first");

        uint256 roles = EnsResolverRoles.SET_ADDR |
            EnsResolverRoles.SET_TEXT |
            EnsResolverRoles.SET_DATA |
            EnsResolverRoles.SET_NAME |
            EnsResolverRoles.CLEAR |
            EnsResolverRoles.UPGRADE;
        roles |= EnsResolverRoles.admin(roles);

        vm.startBroadcast();

        address resolver = IVerifiableFactory(vm.envAddress("ENS_FACTORY")).deployProxy(
            vm.envAddress("ENS_RESOLVER_IMPL"),
            vm.envUint("ENS_BIND_SALT"),
            abi.encodeCall(IPermissionedResolver.initialize, (m.owner, roles))
        );
        IUserRegistry(nameRegistry).setResolver(tokenId, resolver);

        IPermissionedResolver r = IPermissionedResolver(resolver);
        r.setAddr(namehash, m.operator);

        /* The pointer to the bound. */
        r.setText(namehash, "cordon.node", vm.toString(node));
        r.setText(namehash, "cordon.registry", vm.toString(address(registry)));
        r.setText(namehash, "cordon.chain", "eip155:11155111");

        /* ENSIP-26. */
        r.setText(namehash, "agent-endpoint[mcp]", vm.envString("ENS_ENDPOINT_MCP"));
        r.setText(namehash, "agent-context", vm.envString("ENS_AGENT_CONTEXT"));

        /* ENSIP-25, keyed by the ERC-7930 address of the registry the identity
           lives in and the id it was given there. */
        r.setText(
            namehash,
            string.concat(
                "agent-registration[", vm.envString("ENS_REGISTRY_7930"), "][", vm.toString(agentId), "]"
            ),
            "1"
        );

        vm.stopBroadcast();

        console.log("resolver   ", resolver);
        console.log("agentId    ", agentId);
        console.log("endpoint   ", r.text(namehash, "agent-endpoint[mcp]"));
        console.log("context    ", r.text(namehash, "agent-context"));
        console.log("registered ", r.text(namehash, string.concat(
            "agent-registration[", vm.envString("ENS_REGISTRY_7930"), "][", vm.toString(agentId), "]"
        )));
    }
}
