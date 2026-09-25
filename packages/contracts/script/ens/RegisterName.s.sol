// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IETHRegistrar, IMintableToken, IPermissionedRegistry} from "./IEns.sol";

/**
 * Step two: claim the name the commitment reserved.
 *
 * Every argument here has to match the commitment exactly, or the registrar
 * recomputes a different hash and reports a commitment that was never made.
 * That is why the two scripts read the same environment rather than each
 * holding their own copy of the label and the secret.
 *
 * **Run this with `--evm-version cancun`.** This project compiles to Shanghai,
 * which is a choice about our own bytecode; the registry being called here
 * needs a later opcode, and forge simulates the whole call under one EVM
 * version. Without the flag the reveal fails at `ETH_REGISTRY.register` with
 * `EvmError: NotActivated` — a message that reads like a broken registry and
 * is really a simulator configured for an older chain.
 *
 * The arguments travel in a struct because `register` takes eight of them and
 * the reveal has to hold all eight at once; as separate locals this does not
 * compile without `via_ir`, and turning that on for one script would rebuild
 * every contract in the project with a different pipeline.
 */
contract RegisterName is Script {
    struct Claim {
        address registrar;
        address registry;
        address feeToken;
        string label;
        uint64 duration;
        bytes32 secret;
        address owner;
    }

    function run() external {
        Claim memory c = Claim({
            registrar: vm.envAddress("ENS_REGISTRAR"),
            registry: vm.envAddress("ENS_REGISTRY"),
            feeToken: vm.envAddress("ENS_FEE_TOKEN"),
            label: vm.envString("ENS_LABEL"),
            duration: uint64(vm.envOr("ENS_DURATION", uint256(365 days))),
            secret: vm.envBytes32("ENS_SECRET"),
            owner: vm.envAddress("ENS_OWNER")
        });

        uint256 price = _price(c);
        require(
            IMintableToken(c.feeToken).allowance(c.owner, c.registrar) >= price,
            "the registrar was never approved for the fee"
        );

        vm.startBroadcast();
        uint256 tokenId = IETHRegistrar(c.registrar).register(
            c.label, c.owner, c.secret, address(0), address(0), c.duration, c.feeToken, bytes32(0)
        );
        vm.stopBroadcast();

        console.log("label   ", c.label);
        console.log("tokenId ", tokenId);
        console.log("paid6   ", price);
        console.log("subregistry", IPermissionedRegistry(c.registry).getSubregistry(c.label));
        console.log("resolver   ", IPermissionedRegistry(c.registry).getResolver(c.label));
    }

    function _price(Claim memory c) private view returns (uint256) {
        (uint256 base, uint256 premium) =
            IETHRegistrar(c.registrar).getRegisterPrice(c.label, c.duration, c.feeToken);
        return base + premium;
    }
}
