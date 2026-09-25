// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MandateRegistry} from "../../src/MandateRegistry.sol";
import {Fixtures} from "../../test/Fixtures.gen.sol";
import {IUserRegistry, EnsRoles} from "./IEns.sol";

/**
 * An agent spawning beneath itself, and naming what it spawned.
 *
 * Signed by the **operator's** key, not the owner's. This is the mirror doing
 * work rather than being described: the registry lets this operator spawn
 * because it is the parent's operator, and the namespace lets it register
 * because it holds `ROLE_REGISTRAR` in its own subregistry — one authority,
 * expressed twice, and neither one granted by us at the moment it is used.
 *
 * **The name goes to the mandate's owner, not to the operator that made it.**
 * `MandateRegistry.spawn` copies `owner` down from the parent, so every node in
 * a tree has the same owner however deep it sits and whoever created it. A
 * subname owned by its creator would say the opposite: that an agent owns what
 * it spawned, and could keep it after the branch above it was cut.
 */
contract AgentSpawns is Script {
    function run() external {
        MandateRegistry registry = MandateRegistry(vm.envAddress("CORDON_REGISTRY"));
        bytes32 parent = vm.envBytes32("CORDON_PROBE_NODE");
        address agentRegistry = vm.envAddress("ENS_AGENT_REGISTRY");
        address workerOperator = vm.envAddress("CORDON_OPERATOR_WORKER");
        string memory label = vm.envOr("ENS_WORKER_LABEL", string("worker1"));
        uint64 expiry = uint64(vm.envUint("ENS_SUB_EXPIRY"));

        MandateRegistry.Mandate memory p = registry.mandate(parent);

        vm.startBroadcast();

        bytes32 child = registry.spawn(
            parent,
            MandateRegistry.Params({
                operator: workerOperator,
                budget6: p.budget6 / 2,
                lifetimeCap6: p.lifetimeCap6,
                windowSeconds: p.windowSeconds,
                trancheCap6: p.trancheCap6,
                concentrationBps: p.concentrationBps,
                maxDepth: p.maxDepth
            })
        );

        uint256 tokenId = IUserRegistry(agentRegistry).register(
            label, p.owner, address(0), address(0), EnsRoles.SET_RESOLVER, expiry
        );

        vm.stopBroadcast();

        console.log("spawned by     ", p.operator, "(the parent's operator)");
        console.log("child node");
        console.logBytes32(child);
        console.log("child operator ", workerOperator);
        console.log("child budget6  ", p.budget6 / 2);
        console.log("name tokenId   ", tokenId);
        console.log("name owned by  ", IUserRegistry(agentRegistry).ownerOf(tokenId));
        console.log("mandate owner  ", p.owner);
    }
}
