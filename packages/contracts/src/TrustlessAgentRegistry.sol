// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal ERC20 metadata (optional; used only for weight normalization if desired)
interface IERC20Decimals {
    function decimals() external view returns (uint8);
}

/// @notice Trustless Agent Registry + Jobs + Feedback (Amiko-like, EVM edition)
/// - Jobs are registered by a trusted registrar (your worker/facilitator) AFTER verifying x402 payment.
/// - Feedback is 1 per job and updates payment-weighted reputation.
/// - Agents can be lazily created when their first job is registered.
contract TrustlessAgentRegistry {
    // -----------------------------
    // Types
    // -----------------------------
    struct Agent {
        string metadataUri; // IPFS/Arweave/GitHub JSON link
        bool active; // can be toggled by agent
        bool autoCreated; // if created via registerJob
        uint128 totalWeightedRating; // sum(rating * weight)
        uint128 totalWeight; // sum(weight)
        uint32 jobCount;
        uint32 feedbackCount;
        uint64 createdAt;
        uint64 lastUpdate;
    }

    struct Job {
        bytes32 jobId; // unique id (we'll use keccak256(x-payment))
        address client; // who paid / requested service (your choice)
        address agent; // service provider (submitter)
        address token; // payment token (e.g., USDC)
        uint256 amount; // payment amount in token units
        uint64 createdAt;
    }

    struct Feedback {
        uint8 rating; // 1..5
        string commentUri; // optional
        uint64 timestamp;
        address client; // who left feedback (must match job.client)
        address agent;
    }

    // -----------------------------
    // Storage
    // -----------------------------
    mapping(address => Agent) public agents; // agent address => Agent
    mapping(bytes32 => Job) public jobs; // jobId => Job
    mapping(bytes32 => Feedback) public feedbacks; // jobId => Feedback

    /// @notice who can call registerJob (your worker / facilitator)
    address public registrar;

    // reputation fixed point: store average rating * 1e6 for UI friendliness
    uint256 public constant RATING_SCALE = 1e6;

    // -----------------------------
    // Events
    // -----------------------------
    event RegistrarUpdated(address indexed oldRegistrar, address indexed newRegistrar);

    event AgentRegistered(address indexed agent, string metadataUri);
    event AgentUpdated(address indexed agent, string metadataUri);
    event AgentDeactivated(address indexed agent);

    event AgentAutoCreated(address indexed agent);
    event JobRegistered(bytes32 indexed jobId, address indexed agent, address indexed client, address token, uint256 amount);

    event FeedbackSubmitted(bytes32 indexed jobId, address indexed agent, address indexed client, uint8 rating, uint256 amount);
    event ReputationUpdated(address indexed agent, uint256 avgRatingScaled, uint128 totalWeight, uint128 totalWeightedRating);

    // -----------------------------
    // Errors
    // -----------------------------
    error NotRegistrar();
    error NotAgent();
    error InvalidRating();
    error JobExists();
    error JobNotFound();
    error FeedbackExists();
    error UnauthorizedClient();
    error InvalidAddress();
    error InvalidAmount();

    // -----------------------------
    // Modifiers
    // -----------------------------
    modifier onlyRegistrar() {
        if (msg.sender != registrar) revert NotRegistrar();
        _;
    }

    modifier onlyAgent(address agent) {
        if (msg.sender != agent) revert NotAgent();
        _;
    }

    // -----------------------------
    // Constructor / Admin
    // -----------------------------
    constructor(address initialRegistrar) {
        if (initialRegistrar == address(0)) revert InvalidAddress();
        registrar = initialRegistrar;
        emit RegistrarUpdated(address(0), initialRegistrar);
    }

    function setRegistrar(address newRegistrar) external onlyRegistrar {
        if (newRegistrar == address(0)) revert InvalidAddress();
        emit RegistrarUpdated(registrar, newRegistrar);
        registrar = newRegistrar;
    }

    // -----------------------------
    // Agent management
    // -----------------------------
    function registerAgent(string calldata metadataUri) external {
        Agent storage a = agents[msg.sender];

        // "register" also acts as "create if missing"
        if (a.createdAt == 0) {
            a.createdAt = uint64(block.timestamp);
            a.autoCreated = false;
            a.totalWeightedRating = 0;
            a.totalWeight = 0;
            a.jobCount = 0;
            a.feedbackCount = 0;
        }

        a.metadataUri = metadataUri;
        a.active = true;
        a.lastUpdate = uint64(block.timestamp);

        emit AgentRegistered(msg.sender, metadataUri);
    }

    function updateAgent(string calldata metadataUri) external {
        Agent storage a = agents[msg.sender];
        if (a.createdAt == 0) {
            // allow update to also act as create
            a.createdAt = uint64(block.timestamp);
            a.autoCreated = false;
        }
        a.metadataUri = metadataUri;
        a.lastUpdate = uint64(block.timestamp);
        emit AgentUpdated(msg.sender, metadataUri);
    }

    function deactivateAgent() external {
        Agent storage a = agents[msg.sender];
        if (a.createdAt == 0) {
            a.createdAt = uint64(block.timestamp);
            a.autoCreated = false;
        }
        a.active = false;
        a.lastUpdate = uint64(block.timestamp);
        emit AgentDeactivated(msg.sender);
    }

    function setActive(bool active) external {
        Agent storage a = agents[msg.sender];
        if (a.createdAt == 0) {
            a.createdAt = uint64(block.timestamp);
            a.autoCreated = false;
        }
        a.active = active;
        a.lastUpdate = uint64(block.timestamp);
        // reuse events
        if (active) emit AgentUpdated(msg.sender, a.metadataUri);
        else emit AgentDeactivated(msg.sender);
    }

    // -----------------------------
    // Jobs
    // -----------------------------
    /// @notice register a job after verifying x402 payment.
    /// @dev onlyRegistrar. Creates agent lazily if missing.
    function registerJob(bytes32 jobId, address agent, address client, address token, uint256 amount)
        external
        onlyRegistrar
    {
        if (jobId == bytes32(0)) revert InvalidAddress();
        if (agent == address(0) || client == address(0) || token == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (jobs[jobId].jobId != bytes32(0)) revert JobExists();

        // create job
        jobs[jobId] = Job({
            jobId: jobId,
            client: client,
            agent: agent,
            token: token,
            amount: amount,
            createdAt: uint64(block.timestamp)
        });

        // lazy agent creation
        Agent storage a = agents[agent];
        if (a.createdAt == 0) {
            a.createdAt = uint64(block.timestamp);
            a.autoCreated = true;
            a.active = true;
            a.metadataUri = "";
            a.totalWeightedRating = 0;
            a.totalWeight = 0;
            a.jobCount = 0;
            a.feedbackCount = 0;
            a.lastUpdate = uint64(block.timestamp);
            emit AgentAutoCreated(agent);
        }

        // increment job count
        unchecked {
            a.jobCount += 1;
        }
        a.lastUpdate = uint64(block.timestamp);

        emit JobRegistered(jobId, agent, client, token, amount);
    }

    // -----------------------------
    // Feedback + Reputation
    // -----------------------------
    function submitFeedback(bytes32 jobId, uint8 rating, string calldata commentUri) external {
        if (rating < 1 || rating > 5) revert InvalidRating();

        Job memory j = jobs[jobId];
        if (j.jobId == bytes32(0)) revert JobNotFound();
        if (feedbacks[jobId].timestamp != 0) revert FeedbackExists();

        // only the job client can submit feedback
        if (msg.sender != j.client) revert UnauthorizedClient();

        // record feedback
        feedbacks[jobId] = Feedback({
            rating: rating,
            commentUri: commentUri,
            timestamp: uint64(block.timestamp),
            client: msg.sender,
            agent: j.agent
        });

        // update rep (payment weighted)
        Agent storage a = agents[j.agent];
        if (a.createdAt == 0) {
            // should not happen because job registration lazy-creates agent, but keep safe
            a.createdAt = uint64(block.timestamp);
            a.autoCreated = true;
            a.active = true;
            emit AgentAutoCreated(j.agent);
        }

        // weight = amount (token decimals preserved; consistent)
        uint128 weight = _clampToUint128(j.amount);
        uint128 weighted = uint128(rating) * weight;

        a.totalWeightedRating += weighted;
        a.totalWeight += weight;
        unchecked {
            a.feedbackCount += 1;
        }
        a.lastUpdate = uint64(block.timestamp);

        uint256 avgScaled = getAvgRatingScaled(j.agent);

        emit FeedbackSubmitted(jobId, j.agent, msg.sender, rating, j.amount);
        emit ReputationUpdated(j.agent, avgScaled, a.totalWeight, a.totalWeightedRating);
    }

    /// @notice returns avg rating scaled by 1e6 (e.g. 4.25 => 4_250_000)
    function getAvgRatingScaled(address agent) public view returns (uint256) {
        Agent memory a = agents[agent];
        if (a.totalWeight == 0) return 0;
        // avg = totalWeightedRating / totalWeight, scaled by 1e6
        return (uint256(a.totalWeightedRating) * RATING_SCALE) / uint256(a.totalWeight);
    }

    function _clampToUint128(uint256 x) internal pure returns (uint128) {
        if (x > type(uint128).max) {
            // for huge amounts, clamp (prevents overflow); you can revert instead if preferred
            return type(uint128).max;
        }
        return uint128(x);
    }
}
