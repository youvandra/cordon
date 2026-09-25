// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MandateRegistry} from "../../src/MandateRegistry.sol";
import {Fixtures} from "../../test/Fixtures.gen.sol";
import {
    IVerifiableFactory,
    IPermissionedResolver,
    IUserRegistry,
    EnsResolverRoles
} from "./IEns.sol";

/**
 * Stand the demo up: a mandate tree, a resolver, and a name that points at one.
 *
 * Three steps in one broadcast because they are one fact — an agent with a
 * name, a bound, and a way for a stranger to get from the first to the second.
 * Run apart, the middle states are a name resolving to nothing and a mandate
 * nobody can find.
 *
 * **Every figure comes from `packages/fixtures`.** Nothing about the demo is
 * looser than what the tests argue against and the console renders.
 *
 * **What the name carries is a pointer, never a figure.** A cap copied into a
 * text record is a copy, and a copy drifts: the mandate can narrow a minute
 * later while the record still quotes the old number to a seller deciding
 * whether to serve. So the records name the registry and the node, and a
 * reader goes to the contract for the live answer.
 */
contract StandUpDemo is Script {
    function run() external {
        MandateRegistry registry = MandateRegistry(vm.envAddress("CORDON_REGISTRY"));
        address rootOperator = vm.envAddress("CORDON_OPERATOR_ROOT");
        address probeOperator = vm.envAddress("CORDON_OPERATOR_PROBE");
        bytes32 namehash = vm.envBytes32("ENS_NAMEHASH");

        vm.startBroadcast();

        bytes32 root = registry.open(_params(rootOperator, Fixtures.BUDGET6));
        /* Narrower in budget, equal in window. A child window shorter than its
           parent's resets faster than the budget it debits, which turns a
           total into a rate; the registry refuses that, and this is the shape
           that passes. */
        bytes32 probe = registry.spawn(root, _params(probeOperator, Fixtures.BUDGET6 / 2));

        address resolver = _deployResolver();
        IUserRegistry(vm.envAddress("ENS_SUBREGISTRY")).setResolver(
            vm.envUint("ENS_SUB_TOKEN_ID"), resolver
        );

        IPermissionedResolver r = IPermissionedResolver(resolver);
        r.setAddr(namehash, probeOperator);
        r.setText(namehash, "cordon.node", vm.toString(probe));
        r.setText(namehash, "cordon.registry", vm.toString(address(registry)));
        r.setText(namehash, "cordon.chain", "eip155:11155111");

        vm.stopBroadcast();

        console.log("root node");
        console.logBytes32(root);
        console.log("probe node");
        console.logBytes32(probe);
        console.log("resolver       ", resolver);
        console.log("addr           ", r.addr(namehash));
        console.log("cordon.node    ", r.text(namehash, "cordon.node"));
        console.log("cordon.registry", r.text(namehash, "cordon.registry"));
    }

    /**
     * The resolver this name writes through.
     *
     * ENSv2 gives each account its own rather than sharing one, and the
     * account that owns the name holds every role on it: a resolver somebody
     * else can write is a resolver that can say an agent may spend what it
     * may not.
     */
    function _deployResolver() private returns (address) {
        uint256 roles = EnsResolverRoles.SET_ADDR |
            EnsResolverRoles.SET_TEXT |
            EnsResolverRoles.SET_DATA |
            EnsResolverRoles.SET_NAME |
            EnsResolverRoles.CLEAR |
            EnsResolverRoles.UPGRADE;
        roles |= EnsResolverRoles.admin(roles);

        return
            IVerifiableFactory(vm.envAddress("ENS_FACTORY")).deployProxy(
                vm.envAddress("ENS_RESOLVER_IMPL"),
                vm.envOr("ENS_RESOLVER_SALT", uint256(1)),
                abi.encodeCall(
                    IPermissionedResolver.initialize,
                    (vm.envAddress("ENS_OWNER"), roles)
                )
            );
    }

    function _params(address operator, uint128 budget6)
        private
        pure
        returns (MandateRegistry.Params memory)
    {
        return
            MandateRegistry.Params({
                operator: operator,
                budget6: budget6,
                lifetimeCap6: Fixtures.LIFETIME_CAP6,
                windowSeconds: Fixtures.WINDOW_SECONDS,
                trancheCap6: Fixtures.TRANCHE6,
                concentrationBps: Fixtures.CONCENTRATION_BPS,
                maxDepth: Fixtures.MAX_DEPTH
            });
    }
}
