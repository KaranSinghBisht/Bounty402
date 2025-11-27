// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal ERC20 interface
interface IERC20 {
  function transfer(address to, uint256 amount) external returns (bool);
  function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice Safe ERC20 helpers (handles non-standard ERC20s that don't return bool)
library SafeERC20 {
  function safeTransferFrom(IERC20 token, address from, address to, uint256 amount) internal {
    (bool ok, bytes memory data) =
      address(token).call(abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, amount));
    require(ok && (data.length == 0 || abi.decode(data, (bool))), "TRANSFER_FROM_FAILED");
  }

  function safeTransfer(IERC20 token, address to, uint256 amount) internal {
    (bool ok, bytes memory data) =
      address(token).call(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
    require(ok && (data.length == 0 || abi.decode(data, (bool))), "TRANSFER_FAILED");
  }
}

/// @notice Simple reentrancy guard
abstract contract ReentrancyGuard {
  uint256 private _locked = 1;
  modifier nonReentrant() {
    require(_locked == 1, "REENTRANT");
    _locked = 2;
    _;
    _locked = 1;
  }
}

contract Bounty402 is ReentrancyGuard {
  using SafeERC20 for IERC20;

  enum BountyStatus {
    Open,
    Awarded,
    Cancelled,
    Paid
  }

  struct Bounty {
    address creator;
    uint64 deadline;
    BountyStatus status;
    IERC20 token;
    uint256 reward;
    bytes32 specHash; // hash of the bounty spec (store full text/JSON on IPFS/Arweave)
    uint256 winningSubmissionId; // 0 when unset; submissions ids start from 1
  }

  struct Submission {
    address submitter;
    uint64 submittedAt;
    bytes32 artifactHash; // keccak256(content) or keccak256(zip) etc.
    string uri; // IPFS / Arweave / GitHub link
  }

  uint256 public bountyCount;

  mapping(uint256 => Bounty) public bounties;
  mapping(uint256 => uint256) public submissionCount; // bountyId -> count
  mapping(uint256 => mapping(uint256 => Submission)) public submissions; // bountyId -> submissionId -> Submission

  event BountyCreated(
    uint256 indexed bountyId,
    address indexed creator,
    address indexed token,
    uint256 reward,
    uint64 deadline,
    bytes32 specHash
  );

  event SubmissionCreated(
    uint256 indexed bountyId,
    uint256 indexed submissionId,
    address indexed submitter,
    bytes32 artifactHash,
    string uri
  );

  event BountyAwarded(uint256 indexed bountyId, uint256 indexed submissionId, address indexed winner);
  event BountyCancelled(uint256 indexed bountyId);
  event BountyPaid(uint256 indexed bountyId, address indexed winner, uint256 amount);

  error NotCreator();
  error NotOpen();
  error DeadlinePassed();
  error InvalidDeadline();
  error InvalidReward();
  error InvalidSpec();
  error InvalidSubmission();
  error NotWinner();
  error AlreadyFinal();

  function createBounty(
    IERC20 token,
    uint256 reward,
    uint64 deadline,
    bytes32 specHash
  ) external nonReentrant returns (uint256 bountyId) {
    if (reward == 0) revert InvalidReward();
    if (specHash == bytes32(0)) revert InvalidSpec();
    if (deadline <= block.timestamp) revert InvalidDeadline();

    bountyId = ++bountyCount;

    // escrow funds
    token.safeTransferFrom(msg.sender, address(this), reward);

    bounties[bountyId] = Bounty({
      creator: msg.sender,
      deadline: deadline,
      status: BountyStatus.Open,
      token: token,
      reward: reward,
      specHash: specHash,
      winningSubmissionId: 0
    });

    emit BountyCreated(bountyId, msg.sender, address(token), reward, deadline, specHash);
  }

  function submitWork(
    uint256 bountyId,
    bytes32 artifactHash,
    string calldata uri
  ) external returns (uint256 submissionId) {
    Bounty memory b = bounties[bountyId];
    if (b.creator == address(0)) revert InvalidSubmission();
    if (b.status != BountyStatus.Open) revert NotOpen();
    if (block.timestamp > b.deadline) revert DeadlinePassed();
    if (artifactHash == bytes32(0)) revert InvalidSubmission();

    submissionId = ++submissionCount[bountyId];
    // submissions are 1-indexed
    submissions[bountyId][submissionId] = Submission({
      submitter: msg.sender,
      submittedAt: uint64(block.timestamp),
      artifactHash: artifactHash,
      uri: uri
    });

    emit SubmissionCreated(bountyId, submissionId, msg.sender, artifactHash, uri);
  }

  function awardBounty(uint256 bountyId, uint256 submissionId) external {
    Bounty storage b = bounties[bountyId];
    if (b.creator == address(0)) revert InvalidSubmission();
    if (msg.sender != b.creator) revert NotCreator();
    if (b.status != BountyStatus.Open) revert AlreadyFinal();
    if (submissionId == 0 || submissionId > submissionCount[bountyId]) revert InvalidSubmission();

    Submission memory s = submissions[bountyId][submissionId];
    b.status = BountyStatus.Awarded;
    b.winningSubmissionId = submissionId;

    emit BountyAwarded(bountyId, submissionId, s.submitter);
  }

  function cancelBounty(uint256 bountyId) external nonReentrant {
    Bounty storage b = bounties[bountyId];
    if (b.creator == address(0)) revert InvalidSubmission();
    if (msg.sender != b.creator) revert NotCreator();
    if (b.status != BountyStatus.Open) revert AlreadyFinal();

    b.status = BountyStatus.Cancelled;
    b.token.safeTransfer(b.creator, b.reward);

    emit BountyCancelled(bountyId);
  }

  function claim(uint256 bountyId) external nonReentrant {
    Bounty storage b = bounties[bountyId];
    if (b.creator == address(0)) revert InvalidSubmission();
    if (b.status != BountyStatus.Awarded) revert NotOpen();

    Submission memory s = submissions[bountyId][b.winningSubmissionId];
    if (msg.sender != s.submitter) revert NotWinner();

    b.status = BountyStatus.Paid;
    b.token.safeTransfer(s.submitter, b.reward);

    emit BountyPaid(bountyId, s.submitter, b.reward);
  }

  function getWinner(uint256 bountyId) external view returns (address winner, uint256 submissionId) {
    Bounty memory b = bounties[bountyId];
    submissionId = b.winningSubmissionId;
    if (submissionId == 0) return (address(0), 0);
    winner = submissions[bountyId][submissionId].submitter;
  }
}
