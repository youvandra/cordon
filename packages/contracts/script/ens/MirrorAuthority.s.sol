// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MandateRegistry} from "../../src/MandateRegistry.sol";
import {IVerifiableFactory, IUserRegistry, EnsRoles} from "./IEns.sol";

/**
 * Put the mandate's authority into the namespace, and nothing else.
 *
 * `MandateRegistry` permits exactly four things, and each is checked against a
 * named party rather than a role table:
 *
 *   spawn(parent, …)  parent's operator, or the owner
 *   revoke(node)      the owner, or any strict ancestor's operator
 *   fund(root, …)     the owner
 *   draw(node, …)     that node's operator
 *
 * Two of those are about money and have no expression in a namespace. The
 * other two are about the shape of the tree, and ENSv2's Enhanced Access
 * Control expresses them exactly:
 *
 *   an operator that may spawn beneath its node
 *       holds ROLE_REGISTRAR in that node's own subregistry
 *   the owner, who may cut any branch
 *       holds ROLE_UNREGISTER there, and everywhere else in the tree
 *
 * **The mapping may only mirror, never widen.** A role that let someone cut a
 * name whose mandate they cannot revoke would be a permission the contract
 * does not enforce, which is the cosmetic trap this project exists to avoid.
 *
 * **There is no raise-cap role, because there is no raise-cap.** A mandate
 * narrows monotonically and is immutable once open; widening one means opening
 * another, signed by its owner. The namespace cannot express a widening
 * because the contract cannot perform one, and that agreement is the point.
 *
 * **The records stay the owner's.** An operator that could write its own
 * `cordon.node` could point it at a wider mandate and a seller reading the
 * name would be told a bound that does not hold it. So the operator may
 * register beneath itself and may not describe itself.
 */
contract MirrorAuthority is Script {
    function run() external {
        MandateRegistry registry = MandateRegistry(vm.envAddress("CORDON_REGISTRY"));
        bytes32 node = vm.envBytes32("CORDON_PROBE_NODE");
        address owner = vm.envAddress("ENS_OWNER");
        address parentRegistry = vm.envAddress("ENS_SUBREGISTRY");
        uint256 tokenId = vm.envUint("ENS_SUB_TOKEN_ID");

        MandateRegistry.Mandate memory m = registry.mandate(node);
        require(m.exists, "no such mandate");
        require(m.owner == owner, "this account does not own that mandate");

        /* Whether this agent may spawn at all. A node at its tree's maximum
           depth may not, and a namespace that let it register beneath itself
           would be promising something the registry refuses. */
        bool maySpawn = m.depth < m.maxDepth;
        console.log("mandate depth  ", m.depth);
        console.log("max depth      ", m.maxDepth);
        console.log("may spawn      ", maySpawn);
        console.log("operator       ", m.operator);

        if (!maySpawn) {
            console.log("no subregistry: this agent cannot spawn, so its name has nothing beneath it");
            return;
        }

        vm.startBroadcast();

        /* The owner holds everything here, as it does in the mandate: every
           node in a tree carries the same owner, and that is the account that
           can cut any of them. */
        uint256 ownerRoles = EnsRoles.REGISTRAR |
            EnsRoles.UNREGISTER |
            EnsRoles.RENEW |
            EnsRoles.SET_SUBREGISTRY |
            EnsRoles.SET_RESOLVER |
            EnsRoles.UPGRADE;
        ownerRoles |= EnsRoles.admin(ownerRoles);

        address agentRegistry = IVerifiableFactory(vm.envAddress("ENS_FACTORY")).deployProxy(
            vm.envAddress("ENS_USER_REGISTRY_IMPL"),
            vm.envOr("ENS_AGENT_REGISTRY_SALT", uint256(3)),
            abi.encodeCall(IUserRegistry.initialize, (owner, ownerRoles))
        );

        /* And the operator holds the one role its mandate gives it: it may
           register beneath itself, because it may spawn beneath itself. No
           admin bit — an operator that could delegate registration could hand
           out authority the mandate never gave it. No UNREGISTER — cutting a
           branch belongs to whoever may revoke the mandate. */
        IUserRegistry(agentRegistry).grantRootRoles(EnsRoles.REGISTRAR, m.operator);

        IUserRegistry(parentRegistry).setSubregistry(tokenId, agentRegistry);

        vm.stopBroadcast();

        console.log("agent registry ", agentRegistry);
        console.log("operator may register  ", IUserRegistry(agentRegistry).hasRootRoles(EnsRoles.REGISTRAR, m.operator));
        console.log("operator may unregister", IUserRegistry(agentRegistry).hasRootRoles(EnsRoles.UNREGISTER, m.operator));
        console.log("owner may unregister   ", IUserRegistry(agentRegistry).hasRootRoles(EnsRoles.UNREGISTER, owner));
    }
}
