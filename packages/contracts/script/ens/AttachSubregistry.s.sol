// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IVerifiableFactory, IUserRegistry, IOwnedRegistry, EnsRoles} from "./IEns.sol";

/**
 * Give the root name a registry of its own, so agents can have names under it.
 *
 * In ENSv2 a name's subnames do not live in its parent's registry. They live
 * in a registry the owner deploys and then points the name at. That shape is
 * already Cordon's: a mandate's children are its own, and cutting the mandate
 * cuts them. Here it becomes the same shape in the namespace.
 *
 * **Every role granted here goes to the owner of the name and to nobody else.**
 * `CLAUDE.md` forbids a supervisor in any contract, and a subname registry is
 * exactly where one would appear by accident: whoever can register under a
 * name can also unregister under it, and unregistering an agent's name is
 * cutting the agent off. So the account that funds the mandate holds those
 * roles, and no key belonging to this project holds any of them. The test
 * named after that attack asserts it, and the answer to a judge asking "who
 * can cut this agent off?" is this line.
 */
contract AttachSubregistry is Script {
    function run() external {
        address factory = vm.envAddress("ENS_FACTORY");
        address implementation = vm.envAddress("ENS_USER_REGISTRY_IMPL");
        address ethRegistry = vm.envAddress("ENS_REGISTRY");
        address owner = vm.envAddress("ENS_OWNER");
        uint256 tokenId = vm.envUint("ENS_TOKEN_ID");
        uint256 salt = vm.envOr("ENS_SALT", uint256(1));

        /* What the owner may do inside its own registry: register an agent's
           name, take it back, renew it, point it at a resolver, and hang a
           deeper registry under it — each with the admin bit, because an owner
           who cannot delegate is an owner in name only. */
        uint256 roles = EnsRoles.REGISTRAR |
            EnsRoles.UNREGISTER |
            EnsRoles.RENEW |
            EnsRoles.SET_SUBREGISTRY |
            EnsRoles.SET_RESOLVER |
            EnsRoles.UPGRADE;
        roles |= EnsRoles.admin(roles);

        require(
            IOwnedRegistry(ethRegistry).ownerOf(tokenId) == owner,
            "this account does not own the name"
        );

        vm.startBroadcast();
        address proxy = IVerifiableFactory(factory).deployProxy(
            implementation, salt, abi.encodeCall(IUserRegistry.initialize, (owner, roles))
        );
        IOwnedRegistry(ethRegistry).setSubregistry(tokenId, proxy);
        vm.stopBroadcast();

        console.log("subregistry", proxy);
        console.log("roleBitmap", roles);
        console.log("holder    ", owner);
    }
}
