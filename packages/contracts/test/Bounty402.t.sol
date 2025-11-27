// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/Bounty402.sol";

contract MockERC20 {
  string public name = "Mock";
  string public symbol = "MOCK";
  uint8 public decimals = 6;
  mapping(address => uint256) public balanceOf;
  mapping(address => mapping(address => uint256)) public allowance;

  function mint(address to, uint256 amt) external { balanceOf[to] += amt; }

  function approve(address spender, uint256 amt) external returns (bool) {
    allowance[msg.sender][spender] = amt; return true;
  }

  function transfer(address to, uint256 amt) external returns (bool) {
    balanceOf[msg.sender] -= amt;
    balanceOf[to] += amt;
    return true;
  }

  function transferFrom(address from, address to, uint256 amt) external returns (bool) {
    uint256 a = allowance[from][msg.sender];
    require(a >= amt, "ALLOW");
    allowance[from][msg.sender] = a - amt;
    balanceOf[from] -= amt;
    balanceOf[to] += amt;
    return true;
  }
}

contract Bounty402Test is Test {
  Bounty402 b;
  MockERC20 token;

  address alice = address(0xA11CE);
  address bob   = address(0xB0B);

  function setUp() public {
    b = new Bounty402();
    token = new MockERC20();

    token.mint(alice, 1_000_000e6);

    vm.startPrank(alice);
    token.approve(address(b), type(uint256).max);
    vm.stopPrank();
  }

  function testCreateSubmitAwardClaim() public {
    bytes32 specHash = keccak256("do-the-thing");
    uint64 deadline = uint64(block.timestamp + 7 days);

    vm.prank(alice);
    uint256 id = b.createBounty(IERC20(address(token)), 100e6, deadline, specHash);

    // bob submits
    vm.prank(bob);
    uint256 sid = b.submitWork(id, keccak256("artifact"), "ipfs://fake");

    // alice awards bob
    vm.prank(alice);
    b.awardBounty(id, sid);

    uint256 bobBefore = token.balanceOf(bob);

    vm.prank(bob);
    b.claim(id);

    assertEq(token.balanceOf(bob) - bobBefore, 100e6);
  }
}
