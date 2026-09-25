// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IUserRegistry, IOwnedRegistry, EnsRoles} from "./IEns.sol";

/**
 * Give an agent a name under the root.
 *
 * The name is issued by the owner of the root, into the registry the root
 * points at, and it expires no later than the root does — a name that outlived
 * the name above it would resolve to an agent nobody is standing behind.
 *
 * The holder gets `SET_RESOLVER`, so it can publish its own records, and
 * nothing else. It cannot register beneath itself, cannot renew itself and
 * cannot unregister anything, because those are the root owner's to hold: the
 * account that funded the mandate is the account that can cut the agent off,
 * and there is no third party in that sentence.
 */
contract IssueSubname is Script {
    function run() external {
        address subregistry = vm.envAddress("ENS_SUBREGISTRY");
        string memory label = vm.envString("ENS_SUBLABEL");
        address holder = vm.envAddress("ENS_SUBOWNER");
        uint64 expiry = uint64(vm.envUint("ENS_SUB_EXPIRY"));

        uint256 roles = EnsRoles.SET_RESOLVER;

        vm.startBroadcast();
        uint256 tokenId = IUserRegistry(subregistry).register(
            label, holder, address(0), address(0), roles, expiry
        );
        vm.stopBroadcast();

        console.log("label   ", label);
        console.log("holder  ", holder);
        console.log("tokenId ", tokenId);
        console.log("owner   ", IUserRegistry(subregistry).ownerOf(tokenId));
    }
}
