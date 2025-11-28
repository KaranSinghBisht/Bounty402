// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {TrustlessAgentRegistry} from "../src/TrustlessAgentRegistry.sol";

contract DeployRegistry is Script {
    function run() external {
        address registrar = vm.envAddress("REGISTRAR_ADDRESS"); // worker EOA (validator key address)
        vm.startBroadcast();
        TrustlessAgentRegistry reg = new TrustlessAgentRegistry(registrar);
        vm.stopBroadcast();

        console2.log("TrustlessAgentRegistry deployed at:", address(reg));
        console2.log("Registrar:", registrar);
    }
}
