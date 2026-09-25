// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MandateRegistry} from "../../src/MandateRegistry.sol";
import {TreeVault} from "../../src/TreeVault.sol";
import {CordonResolver} from "../../src/CordonResolver.sol";
import {IUserRegistry} from "./IEns.sol";

/**
 * Deploy the resolver that answers from the contracts, and point a name at it.
 *
 * This replaces `BindAgentName` and the resolver half of `PublishAgentRecords`,
 * and the difference is what it does NOT do: there are no `setText` calls here,
 * because there is nothing to store. `cordon.live`, `cordon.headroom` and
 * `cordon.boundBy` are computed when a reader asks.
 *
 * It is deployed ONCE per tree, not once per agent. ENSIP-10 wildcard
 * resolution means the resolver set on the tree's root name answers for every
 * subname beneath it, so a spawn costs no ENS transaction — only `bind`, which
 * names which mandate a label speaks for and which only the owner may call.
 *
 * Run after `StandUpDemo` (which creates the tree) and after the name has a
 * registry of its own (`AttachSubregistry`).
 */
contract DeployResolver is Script {
    function run() external {
        MandateRegistry registry = MandateRegistry(vm.envAddress("CORDON_REGISTRY"));
        TreeVault vault = TreeVault(vm.envAddress("CORDON_VAULT"));
        bytes32 node = vm.envBytes32("CORDON_BIND_NODE");
        bytes32 namehash = vm.envBytes32("ENS_BIND_NAMEHASH");
        address nameRegistry = vm.envAddress("ENS_BIND_REGISTRY");
        uint256 tokenId = vm.envUint("ENS_BIND_TOKEN_ID");

        MandateRegistry.Mandate memory m = registry.mandate(node);
        require(m.exists, "no such mandate");

        vm.startBroadcast();

        CordonResolver resolver = new CordonResolver(registry, vault);
        resolver.bind(namehash, node);
        IUserRegistry(nameRegistry).setResolver(tokenId, address(resolver));

        vm.stopBroadcast();

        console.log("resolver        ", address(resolver));
        console.log("node            ");
        console.logBytes32(node);
        console.log("addr            ", resolver.addr(namehash));
        console.log("cordon.live     ", resolver.text(namehash, "cordon.live"));
        console.log("cordon.headroom ", resolver.text(namehash, "cordon.headroom"));
        console.log("cordon.boundBy  ", resolver.text(namehash, "cordon.boundBy"));
        console.log("");
        console.log("Nothing above was stored. Revoke the mandate and read again.");
    }
}
