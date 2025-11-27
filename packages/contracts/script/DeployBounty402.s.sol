// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/Bounty402.sol";

contract DeployBounty402 is Script {
    function run() external returns (Bounty402 deployed) {
        uint256 pk = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(pk);
        deployed = new Bounty402();
        vm.stopBroadcast();

        console2.log("Bounty402 deployed at:", address(deployed));
    }
}
