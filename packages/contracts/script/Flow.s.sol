// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/Bounty402.sol";

interface IERC20_ {
    function approve(address spender, uint256 amount) external returns (bool);
}

contract Flow is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        uint256 submitterPk = vm.envUint("SUBMITTER_PRIVATE_KEY");

        address creator = vm.addr(pk);
        address submitter = vm.addr(submitterPk);

        address bountyAddr = vm.envAddress("BOUNTY402_ADDRESS");
        address usdcAddr = vm.envAddress("USDC_BASE_SEPOLIA");
        address validator = vm.envAddress("VALIDATOR_ADDRESS");

        require(validator == creator, "VALIDATOR_ADDRESS must equal creator for this flow");

        Bounty402 bounty = Bounty402(bountyAddr);
        IERC20_ usdc = IERC20_(usdcAddr);

        uint256 reward = 10_000; // 0.01 USDC (6 decimals)
        bytes32 specHash = keccak256(bytes("spec-v1"));
        uint64 deadline = uint64(block.timestamp + 7 days);
        bytes32 artifactHash = keccak256(bytes("artifact-v1"));

        // Creator: approve + create bounty
        vm.startBroadcast(pk);
        usdc.approve(bountyAddr, reward);
        uint256 bountyId = bounty.createBountyWithValidator(IERC20(usdcAddr), reward, deadline, specHash, validator);
        vm.stopBroadcast();

        // Submitter: submit + claim with validator signature
        vm.startBroadcast(submitterPk);

        uint256 submissionId = bounty.submitWork(bountyId, artifactHash, "ipfs://demo");

        bytes32 digest = bounty.attestationDigest(bountyId, submissionId, submitter, artifactHash);
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, ethHash);
        bytes memory sig = abi.encodePacked(r, s, v);

        bounty.claimWithAttestation(bountyId, submissionId, sig);

        vm.stopBroadcast();

        console2.log("creator:", creator);
        console2.log("submitter:", submitter);
        console2.log("bountyId:", bountyId);
        console2.log("submissionId:", submissionId);
        console2.logBytes32(artifactHash);
        console2.logBytes32(digest);
    }
}
