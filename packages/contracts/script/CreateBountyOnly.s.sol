// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/Bounty402.sol";

interface IERC20_ {
    function approve(address spender, uint256 amount) external returns (bool);
}

contract CreateBountyOnly is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");

        address bountyAddr = vm.envAddress("BOUNTY402_ADDRESS");
        address usdcAddr = vm.envAddress("USDC_BASE_SEPOLIA");
        address validator = vm.envAddress("VALIDATOR_ADDRESS");

        address creator = vm.addr(pk);

        Bounty402 bounty = Bounty402(bountyAddr);
        IERC20_ usdc = IERC20_(usdcAddr);

        uint256 reward = 10_000; // 0.01 USDC (6 decimals)
        bytes32 specHash = keccak256(bytes("spec-v1"));
        uint64 deadline = uint64(block.timestamp + 7 days);

        vm.startBroadcast(pk);
        usdc.approve(bountyAddr, reward);
        uint256 bountyId = bounty.createBountyWithValidator(IERC20(usdcAddr), reward, deadline, specHash, validator);
        vm.stopBroadcast();

        console2.log("creator:", creator);
        console2.log("bountyId:", bountyId);
    }
}
