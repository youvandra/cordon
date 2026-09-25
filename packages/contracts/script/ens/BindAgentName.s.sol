// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MandateRegistry} from "../../src/MandateRegistry.sol";
import {
    IVerifiableFactory,
    IPermissionedResolver,
    IUserRegistry,
    EnsResolverRoles
} from "./IEns.sol";

/**
 * Give an agent's name a resolver and point it at the agent's mandate.
 *
 * The same four records every agent publishes, written by the owner, because
 * an operator able to write its own `cordon.node` could point it at a wider
 * mandate than the one holding it.
 *
 * What is written is a pointer and never a figure. The cap lives in the
 * contract, changes there, and is read from there.
 */
contract BindAgentName is Script {
    function run() external {
        address registry = vm.envAddress("CORDON_REGISTRY");
        bytes32 mandateNode = vm.envBytes32("CORDON_BIND_NODE");
        bytes32 namehash = vm.envBytes32("ENS_BIND_NAMEHASH");
        address nameRegistry = vm.envAddress("ENS_BIND_REGISTRY");
        uint256 tokenId = vm.envUint("ENS_BIND_TOKEN_ID");

        MandateRegistry.Mandate memory m = MandateRegistry(registry).mandate(mandateNode);
        require(m.exists, "no such mandate");

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
        r.setText(namehash, "cordon.node", vm.toString(mandateNode));
        r.setText(namehash, "cordon.registry", vm.toString(registry));
        r.setText(namehash, "cordon.chain", "eip155:11155111");

        vm.stopBroadcast();

        console.log("resolver       ", resolver);
        console.log("addr           ", r.addr(namehash));
        console.log("cordon.node    ", r.text(namehash, "cordon.node"));
        console.log("operator       ", m.operator);
        console.log("budget6        ", m.budget6);
    }
}
