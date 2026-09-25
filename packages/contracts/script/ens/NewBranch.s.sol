// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MandateRegistry} from "../../src/MandateRegistry.sol";
import {IUserRegistry, EnsRoles} from "./IEns.sol";

/**
 * A fresh branch under the root, and the root operator's own role to make it.
 *
 * Two things happen here and the second is a correction. The branch is spawned
 * and named; and the root's registry finally grants `ROLE_REGISTRAR` to the
 * root mandate's operator, which it should have had from the start — that
 * operator may spawn beneath the root, so it may register beneath the root's
 * name. Until now only the owner held it, which made the namespace narrower
 * than the mandate at the top of the tree while it mirrored exactly further
 * down.
 *
 * The name goes to the owner, as every name in a tree does, because
 * `MandateRegistry.spawn` copies the owner down from the parent.
 */
contract NewBranch is Script {
    function run() external {
        MandateRegistry registry = MandateRegistry(vm.envAddress("CORDON_REGISTRY"));
        bytes32 root = vm.envBytes32("CORDON_ROOT_NODE");
        address operator = vm.envAddress("CORDON_NEW_OPERATOR");
        address nameRegistry = vm.envAddress("ENS_SUBREGISTRY");
        string memory label = vm.envString("ENS_NEW_LABEL");
        uint64 expiry = uint64(vm.envUint("ENS_SUB_EXPIRY"));

        MandateRegistry.Mandate memory r = registry.mandate(root);

        vm.startBroadcast();

        /* The mirror, completed at the level it was missing. */
        IUserRegistry(nameRegistry).grantRootRoles(EnsRoles.REGISTRAR, r.operator);

        bytes32 node = registry.spawn(
            root,
            MandateRegistry.Params({
                operator: operator,
                budget6: r.budget6 / 2,
                lifetimeCap6: r.lifetimeCap6,
                windowSeconds: r.windowSeconds,
                trancheCap6: r.trancheCap6,
                concentrationBps: r.concentrationBps,
                maxDepth: r.maxDepth
            })
        );

        uint256 tokenId = IUserRegistry(nameRegistry).register(
            label, r.owner, address(0), address(0), EnsRoles.SET_RESOLVER, expiry
        );

        vm.stopBroadcast();

        console.log("label          ", label);
        console.log("node");
        console.logBytes32(node);
        console.log("operator       ", operator);
        console.log("budget6        ", r.budget6 / 2);
        console.log("name tokenId   ", tokenId);
        console.log("root op may register", IUserRegistry(nameRegistry).hasRootRoles(EnsRoles.REGISTRAR, r.operator));
    }
}
