// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MandateRegistry} from "../../src/MandateRegistry.sol";
import {Fixtures} from "../../test/Fixtures.gen.sol";
import {IUserRegistry, EnsRoles, LabelAlreadyRegistered} from "./IEns.sol";

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
 *
 * **Re-runnable, in both halves, because a redeploy makes it necessary.**
 * A name outlives the contracts: `worker1.probe.mira.eth` was still registered
 * and unexpired after the 26 September redeploy, while the mandate it named
 * had gone with the old registry. The original wrote both in one broadcast, so
 * the register reverting `LabelAlreadyRegistered` discarded the spawn that had
 * just succeeded — and the fix for a tree missing a node was a script that
 * could not be run twice.
 *
 * So each half asks whether its work is already done:
 *
 *  - The spawn is skipped when `CORDON_CHILD_NODE` names a mandate that
 *    exists. Without it a second run spawns a second child, because a node id
 *    is derived from a nonce and nothing makes two spawns the same one.
 *  - The register is skipped when the registry says the label is taken. Only
 *    that error: anything else still stops the run, because a name that
 *    cannot be registered for some other reason is not a name that is ready.
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

        /* An existing child, if the caller names one and the registry holds it.
           Checked before the broadcast so a re-run costs nothing when there is
           nothing to do. */
        bytes32 child = vm.envOr("CORDON_CHILD_NODE", bytes32(0));
        bool spawned = false;
        if (child != bytes32(0) && !registry.mandate(child).exists) {
            revert("CORDON_CHILD_NODE names no mandate in this registry");
        }

        /* Is the label already taken?
           Asked by attempting it on a snapshot and throwing the snapshot away,
           because this registry offers no view that answers it: `getResolver`
           and `getSubregistry` return zero both for a name that is free and
           for one registered without either.

           Outside the broadcast, deliberately. A call made inside one is
           recorded as a transaction to send even when a try/catch swallows
           its revert, so probing in there produced a script that printed the
           right answer and then failed trying to broadcast a call it already
           knew would revert. */
        uint256 snapshot = vm.snapshotState();
        bool taken = false;
        try
            IUserRegistry(agentRegistry).register(
                label, p.owner, address(0), address(0), EnsRoles.SET_RESOLVER, expiry
            )
        returns (uint256) {
            taken = false;
        } catch (bytes memory err) {
            if (bytes4(err) != LabelAlreadyRegistered.selector) {
                assembly { revert(add(err, 0x20), mload(err)) }
            }
            taken = true;
        }
        vm.revertToState(snapshot);

        vm.startBroadcast();

        if (child == bytes32(0)) {
            child = registry.spawn(
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
            spawned = true;
        }

        uint256 tokenId;
        if (!taken) {
            tokenId = IUserRegistry(agentRegistry).register(
                label, p.owner, address(0), address(0), EnsRoles.SET_RESOLVER, expiry
            );
        }

        vm.stopBroadcast();

        console.log("spawned by     ", p.operator, "(the parent's operator)");
        console.log("child node");
        console.logBytes32(child);
        console.log("child is new   ", spawned);
        console.log("child operator ", workerOperator);
        console.log("child budget6  ", p.budget6 / 2);
        console.log("label          ", label);
        if (taken) {
            console.log("name           already registered, left as it is");
        } else {
            console.log("name tokenId   ", tokenId);
            console.log("name owned by  ", IUserRegistry(agentRegistry).ownerOf(tokenId));
        }
        console.log("mandate owner  ", p.owner);
        console.log("Bind the name to this node with BindSubname before it resolves.");
    }
}
