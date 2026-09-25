// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IETHRegistrar, IMintableToken} from "./IEns.sol";

/**
 * Step one of registering the root name: mint the fee, approve it, and commit.
 *
 * ENSv2 registers in two transactions at least `MIN_COMMITMENT_AGE` apart. The
 * commitment hides the label until the name is claimed, so nobody watching the
 * mempool can take it first. Both steps are scripts rather than a sequence of
 * `cast send` calls because the secret has to be identical in each, and a
 * secret typed twice is a secret typed differently once.
 *
 * The fee token mints to anyone who asks, with no access control. That is what
 * makes it safe to run this on a testnet, and it is a different token from the
 * one a mandate spends — see `SEPOLIA.erc20`, whose supply nobody here can
 * conjure.
 */
contract CommitName is Script {
    function run() external {
        address registrar = vm.envAddress("ENS_REGISTRAR");
        address feeToken = vm.envAddress("ENS_FEE_TOKEN");
        string memory label = vm.envString("ENS_LABEL");
        uint64 duration = uint64(vm.envOr("ENS_DURATION", uint256(365 days)));
        bytes32 secret = vm.envBytes32("ENS_SECRET");
        address owner = vm.envAddress("ENS_OWNER");

        IETHRegistrar reg = IETHRegistrar(registrar);
        require(reg.isAvailable(label), "name is not available");

        (uint256 base, uint256 premium) = reg.getRegisterPrice(label, duration, feeToken);
        uint256 price = base + premium;
        console.log("label    ", label);
        console.log("owner    ", owner);
        console.log("price6   ", price);

        /* No subregistry and no resolver yet. Both are set afterwards, by the
           owner, in transactions that can be read on their own. A name that
           arrives already pointing somewhere hides which step did it. */
        bytes32 commitment =
            reg.makeCommitment(label, owner, secret, address(0), address(0), duration, bytes32(0));
        console.log("commitment");
        console.logBytes32(commitment);

        vm.startBroadcast();
        IMintableToken token = IMintableToken(feeToken);
        /* Twice the price, so a second attempt after a failed reveal needs no
           second mint. */
        token.mint(owner, price * 2);
        token.approve(registrar, price * 2);
        reg.commit(commitment);
        vm.stopBroadcast();

        console.log("minted and committed. wait at least this many seconds:");
        console.log(reg.MIN_COMMITMENT_AGE());
    }
}
