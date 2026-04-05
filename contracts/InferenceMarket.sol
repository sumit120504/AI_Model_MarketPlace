// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title InferenceMarket
 * @dev Core workflow engine for AI inference, proof verification and settlement
 */

// Interface for ModelRegistry contract
interface IModelRegistry {
    struct Model {
        uint256 modelId;
        address creator;
        string ipfsHash;
        string name;
        string description;
        uint8 category;
        uint256 pricePerInference;
        uint256 creatorStake;
        uint256 totalInferences;
        uint256 totalEarnings;
        uint256 reputationScore;
        uint256 evaluationScore;
        uint256 createdAt;
        uint256 updatedAt;
        uint256 currentVersion;
        uint256 lastPriceUpdate;
        uint256 deactivatedAt;
        bytes32 currentProvenanceHash;
        bool isActive;
    }

    function getModel(uint256 _modelId) external view returns (Model memory);
    function isModelAvailable(uint256 _modelId) external view returns (bool);
    function recordInference(uint256 _modelId, uint256 _payment) external;
    function penalizeModel(uint256 _modelId, uint256 _slashAmount) external;
}

/**
 * @title InferenceMarket
 * @dev Handles inference requests, payments, and verification
 */
contract InferenceMarket {

    // ============ Structs ============

    struct InferenceRequest {
        uint256 requestId;
        uint256 modelId;
        address user;
        uint256 payment;
        bytes32 inputDataHash;
        bytes32 resultHash;
        bytes32 proofHash;
        address computeNode;
        uint256 createdAt;
        uint256 pickedUpAt;
        uint256 completedAt;
        RequestStatus status;
    }

    enum RequestStatus {
        PENDING,
        COMPUTING,
        VERIFYING,
        COMPLETED,
        FAILED,
        REFUNDED,
        DISPUTED
    }

    // ============ State Variables ============

    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    IModelRegistry public modelRegistry;

    uint256 public requestCounter;
    uint256 public constant REQUEST_PICKUP_TIMEOUT = 10 minutes;
    uint256 public constant COMPUTE_TIMEOUT = 5 minutes;
    uint256 public constant PLATFORM_FEE_PERCENT = 5;
    uint256 public constant COMPUTE_NODE_FEE_PERCENT = 10;
    uint256 public constant CREATOR_FEE_PERCENT = 85;

    mapping(uint256 => InferenceRequest) public requests;
    mapping(address => uint256[]) public userRequests;
    mapping(address => bool) public authorizedComputeNodes;

    mapping(address => uint256) public creatorEarnings;
    mapping(address => uint256) public nodeEarnings;
    mapping(address => uint256) public refundableUserBalances;

    mapping(address => uint256) public creatorTokenRewards;
    uint256 public tokenRate;

    uint256 public weightAccuracy;
    uint256 public weightEfficiency;
    uint256 public weightReliability;
    uint256 public weightResponseTime;

    address public owner;
    uint256 public platformEarnings;
    bool public paused;
    uint256 private _status;

    // ============ Events ============

    event InferenceRequested(
        uint256 indexed requestId,
        uint256 indexed modelId,
        address indexed user,
        bytes32 inputDataHash,
        uint256 payment
    );

    event RequestStatusUpdated(
        uint256 indexed requestId,
        RequestStatus previousStatus,
        RequestStatus newStatus
    );

    event InferenceComputing(uint256 indexed requestId, address indexed computeNode);

    event InferenceCompleted(
        uint256 indexed requestId,
        bytes32 resultHash,
        bytes32 proofHash,
        address indexed computeNode
    );

    event InferenceFailed(uint256 indexed requestId, string reason);

    event PaymentReleased(
        uint256 indexed requestId,
        address indexed creator,
        address indexed computeNode,
        uint256 creatorAmount,
        uint256 nodeAmount,
        uint256 platformFee
    );

    event UserRefunded(uint256 indexed requestId, address indexed user, uint256 amount);

    event CreatorEarningsWithdrawn(address indexed creator, uint256 amount);
    event NodeEarningsWithdrawn(address indexed node, uint256 amount);
    event UserRefundWithdrawn(address indexed user, uint256 amount);
    event PlatformEarningsWithdrawn(address indexed owner, uint256 amount);

    event ComputeNodeAuthorized(address indexed node);
    event ComputeNodeRevoked(address indexed node);

    event TokenRateUpdated(uint256 previousRate, uint256 newRate);
    event EvaluationWeightsUpdated(
        uint256 accuracy,
        uint256 efficiency,
        uint256 reliability,
        uint256 responseTime
    );

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Paused(address indexed account);
    event Unpaused(address indexed account);

    // ============ Modifiers ============

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    modifier onlyAuthorizedNode() {
        require(authorizedComputeNodes[msg.sender], "Not authorized compute node");
        _;
    }

    modifier requestExists(uint256 _requestId) {
        require(requests[_requestId].user != address(0), "Request does not exist");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    modifier nonReentrant() {
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    // ============ Constructor ============

    /**
     * @dev Initialize with ModelRegistry address
     * @param _modelRegistryAddress Address of deployed ModelRegistry contract
     */
    constructor(address _modelRegistryAddress) {
        require(_modelRegistryAddress != address(0), "Invalid registry address");
        owner = msg.sender;
        modelRegistry = IModelRegistry(_modelRegistryAddress);
        tokenRate = 1;
        weightAccuracy = 25;
        weightEfficiency = 25;
        weightReliability = 25;
        weightResponseTime = 25;
        _status = _NOT_ENTERED;

        authorizedComputeNodes[msg.sender] = true;
        emit ComputeNodeAuthorized(msg.sender);
    }

    // ============ Core Functions ============

    /**
     * @dev Create inference request and lock payment
     * @param _modelId Model to use for inference
     * @param _inputDataHash Keccak256 hash of the input data
     * @return newRequestId The ID of the created request
     */
    function requestInference(
        uint256 _modelId,
        bytes32 _inputDataHash
    ) external payable whenNotPaused returns (uint256) {
        require(_inputDataHash != bytes32(0), "Invalid input hash");
        require(modelRegistry.isModelAvailable(_modelId), "Model not available");

        IModelRegistry.Model memory model = modelRegistry.getModel(_modelId);

        require(msg.value >= model.pricePerInference, "Insufficient payment");

        requestCounter++;
        uint256 newRequestId = requestCounter;

        requests[newRequestId] = InferenceRequest({
            requestId: newRequestId,
            modelId: _modelId,
            user: msg.sender,
            payment: msg.value,
            inputDataHash: _inputDataHash,
            resultHash: bytes32(0),
            proofHash: bytes32(0),
            computeNode: address(0),
            createdAt: block.timestamp,
            pickedUpAt: 0,
            completedAt: 0,
            status: RequestStatus.PENDING
        });

        userRequests[msg.sender].push(newRequestId);

        emit InferenceRequested(newRequestId, _modelId, msg.sender, _inputDataHash, msg.value);

        return newRequestId;
    }

    /**
     * @dev Compute node picks up a pending request
     * @param _requestId Request ID to process
     */
    function pickupRequest(uint256 _requestId)
        external 
        onlyAuthorizedNode 
        requestExists(_requestId)
        whenNotPaused
    {
        InferenceRequest storage request = requests[_requestId];

        require(request.status == RequestStatus.PENDING, "Request not pending");
        require(
            block.timestamp <= request.createdAt + REQUEST_PICKUP_TIMEOUT,
            "Pickup timeout exceeded"
        );
        RequestStatus previousStatus = request.status;

        request.status = RequestStatus.COMPUTING;
        request.computeNode = msg.sender;
        request.pickedUpAt = block.timestamp;

        emit InferenceComputing(_requestId, msg.sender);
        emit RequestStatusUpdated(_requestId, previousStatus, RequestStatus.COMPUTING);
    }

    /**
     * @dev Submit inference result with proof and node signature
     * @param _requestId Request ID
     * @param _resultHash Keccak256 hash of the result
     * @param _proofHash Combined proof hash from inference node
     * @param _signature Signature over _proofHash from assigned node
     * @param _modelWeightsHash Hash of model weights used by node
     * @param _proofTimestamp Timestamp used in proof generation
     * @param _resultData Raw result payload for hash consistency check
     */
    function submitResult(
        uint256 _requestId,
        bytes32 _resultHash,
        bytes32 _proofHash,
        bytes calldata _signature,
        bytes32 _modelWeightsHash,
        uint256 _proofTimestamp,
        bytes calldata _resultData
    ) external onlyAuthorizedNode requestExists(_requestId) whenNotPaused {
        InferenceRequest storage request = requests[_requestId];

        require(request.status == RequestStatus.COMPUTING, "Not in computing state");
        require(request.computeNode == msg.sender, "Not assigned to you");
        require(
            block.timestamp <= request.pickedUpAt + COMPUTE_TIMEOUT,
            "Compute timeout exceeded"
        );

        RequestStatus previousStatus = request.status;
        request.status = RequestStatus.VERIFYING;
        emit RequestStatusUpdated(_requestId, previousStatus, RequestStatus.VERIFYING);

        bytes32 computedHash = keccak256(_resultData);
        require(computedHash == _resultHash, "Hash mismatch - proof invalid");

        require(_proofTimestamp >= request.pickedUpAt, "Invalid proof timestamp");
        require(_proofTimestamp <= block.timestamp + 2 minutes, "Future proof timestamp");
        require(_modelWeightsHash != bytes32(0), "Invalid model weights hash");

        bytes32 computedProofHash = keccak256(
            abi.encodePacked(
                _requestId,
                request.inputDataHash,
                _resultHash,
                _modelWeightsHash,
                _proofTimestamp
            )
        );
        require(computedProofHash == _proofHash, "Proof hash mismatch");

        address recoveredSigner = _recoverSigner(_proofHash, _signature);
        require(recoveredSigner == request.computeNode, "Invalid node signature");

        request.resultHash = _resultHash;
        request.proofHash = _proofHash;
        request.completedAt = block.timestamp;
        request.status = RequestStatus.COMPLETED;

        _releasePayment(_requestId);

        emit InferenceCompleted(_requestId, _resultHash, _proofHash, msg.sender);
        emit RequestStatusUpdated(_requestId, RequestStatus.VERIFYING, RequestStatus.COMPLETED);
    }

    /**
     * @dev Legacy submitResult for backward compatibility with existing backend calls.
     *      This path derives a deterministic proof from request context and sender.
     */
    function submitResult(
        uint256 _requestId,
        bytes32 _resultHash,
        string memory _resultData
    ) external onlyAuthorizedNode requestExists(_requestId) whenNotPaused {
        InferenceRequest storage request = requests[_requestId];

        require(request.status == RequestStatus.COMPUTING, "Not in computing state");
        require(request.computeNode == msg.sender, "Not assigned to you");
        require(
            block.timestamp <= request.pickedUpAt + COMPUTE_TIMEOUT,
            "Compute timeout exceeded"
        );

        RequestStatus previousStatus = request.status;
        request.status = RequestStatus.VERIFYING;
        emit RequestStatusUpdated(_requestId, previousStatus, RequestStatus.VERIFYING);

        bytes32 computedHash = keccak256(bytes(_resultData));
        require(computedHash == _resultHash, "Hash mismatch - proof invalid");

        bytes32 legacyWeightsHash = keccak256(abi.encodePacked("LEGACY_MODEL_WEIGHTS", request.modelId));
        bytes32 legacyProofHash = keccak256(
            abi.encodePacked(
                _requestId,
                request.inputDataHash,
                _resultHash,
                legacyWeightsHash,
                block.timestamp,
                msg.sender
            )
        );

        request.resultHash = _resultHash;
        request.proofHash = legacyProofHash;
        request.completedAt = block.timestamp;
        request.status = RequestStatus.COMPLETED;

        _releasePayment(_requestId);

        emit InferenceCompleted(_requestId, _resultHash, legacyProofHash, msg.sender);
        emit RequestStatusUpdated(_requestId, RequestStatus.VERIFYING, RequestStatus.COMPLETED);
    }

    /**
     * @dev Internal function to distribute payment
     * Payment split: 85% creator, 10% compute node, 5% platform
     */
    function _releasePayment(uint256 _requestId) internal {
        InferenceRequest storage request = requests[_requestId];
        uint256 totalPayment = request.payment;

        uint256 platformFee = (totalPayment * PLATFORM_FEE_PERCENT) / 100;
        uint256 nodeFee = (totalPayment * COMPUTE_NODE_FEE_PERCENT) / 100;
        uint256 creatorPayment = (totalPayment * CREATOR_FEE_PERCENT) / 100;

        IModelRegistry.Model memory model = modelRegistry.getModel(request.modelId);
        address creator = model.creator;

        creatorEarnings[creator] += creatorPayment;
        platformEarnings += platformFee;
        nodeEarnings[request.computeNode] += nodeFee;
        creatorTokenRewards[creator] += tokenRate;

        request.payment = 0;

        modelRegistry.recordInference(request.modelId, creatorPayment);

        emit PaymentReleased(
            _requestId,
            creator,
            request.computeNode,
            creatorPayment,
            nodeFee,
            platformFee
        );
    }

    /**
     * @dev User can request refund if request timed out
     * @param _requestId Request ID to refund
     */
    function requestRefund(uint256 _requestId)
        external 
        requestExists(_requestId)
        whenNotPaused
    {
        InferenceRequest storage request = requests[_requestId];

        require(request.user == msg.sender, "Not your request");
        require(
            request.status == RequestStatus.PENDING ||
            request.status == RequestStatus.COMPUTING,
            "Cannot refund in current state"
        );

        if (request.status == RequestStatus.PENDING) {
            require(
                block.timestamp > request.createdAt + REQUEST_PICKUP_TIMEOUT,
                "Pickup timeout not reached"
            );
        } else {
            require(request.pickedUpAt > 0, "Request not picked up");
            require(
                block.timestamp > request.pickedUpAt + COMPUTE_TIMEOUT,
                "Compute timeout not reached"
            );
        }

        uint256 refundAmount = request.payment;
        RequestStatus previousStatus = request.status;
        request.status = RequestStatus.REFUNDED;
        request.payment = 0;

        refundableUserBalances[msg.sender] += refundAmount;

        emit UserRefunded(_requestId, msg.sender, refundAmount);
        emit RequestStatusUpdated(_requestId, previousStatus, RequestStatus.REFUNDED);
    }

    /**
     * @dev Report failed inference (compute node)
     * @param _requestId Request ID that failed
     * @param _reason Reason for failure
     */
    function reportFailure(uint256 _requestId, string memory _reason)
        external 
        onlyAuthorizedNode 
        requestExists(_requestId)
        whenNotPaused
    {
        InferenceRequest storage request = requests[_requestId];

        require(request.computeNode == msg.sender, "Not your request");
        require(request.status == RequestStatus.COMPUTING, "Not in computing state");
        RequestStatus previousStatus = request.status;

        request.status = RequestStatus.FAILED;

        uint256 refundAmount = request.payment;
        request.payment = 0;
        refundableUserBalances[request.user] += refundAmount;

        modelRegistry.penalizeModel(request.modelId, 0.001 ether);

        emit InferenceFailed(_requestId, _reason);
        emit UserRefunded(_requestId, request.user, refundAmount);
        emit RequestStatusUpdated(_requestId, previousStatus, RequestStatus.FAILED);
    }

    // ============ View Functions ============

    /**
     * @dev Get complete request details
     */
    function getRequest(uint256 _requestId)
        external 
        view 
        requestExists(_requestId) 
        returns (InferenceRequest memory)
    {
        return requests[_requestId];
    }

    /**
     * @dev Get all request IDs for a user
     */
    function getUserRequests(address _user)
        external 
        view 
        returns (uint256[] memory)
    {
        return userRequests[_user];
    }

    /**
     * @dev Get all pending requests (for compute nodes)
     */
    function getPendingRequests() external view returns (uint256[] memory) {
        uint256 pendingCount = 0;

        for (uint256 i = 1; i <= requestCounter; i++) {
            if (requests[i].status == RequestStatus.PENDING &&
                block.timestamp <= requests[i].createdAt + REQUEST_PICKUP_TIMEOUT) {
                pendingCount++;
            }
        }

        uint256[] memory pending = new uint256[](pendingCount);
        uint256 index = 0;

        for (uint256 i = 1; i <= requestCounter; i++) {
            if (requests[i].status == RequestStatus.PENDING &&
                block.timestamp <= requests[i].createdAt + REQUEST_PICKUP_TIMEOUT) {
                pending[index] = i;
                index++;
            }
        }

        return pending;
    }

    /**
     * @dev Get request status as string
     */
    function getRequestStatus(uint256 _requestId)
        external 
        view 
        requestExists(_requestId) 
        returns (string memory)
    {
        RequestStatus status = requests[_requestId].status;

        if (status == RequestStatus.PENDING) return "PENDING";
        if (status == RequestStatus.COMPUTING) return "COMPUTING";
        if (status == RequestStatus.VERIFYING) return "VERIFYING";
        if (status == RequestStatus.COMPLETED) return "COMPLETED";
        if (status == RequestStatus.FAILED) return "FAILED";
        if (status == RequestStatus.REFUNDED) return "REFUNDED";
        if (status == RequestStatus.DISPUTED) return "DISPUTED";

        return "UNKNOWN";
    }

    // ============ Admin Functions ============

    /**
     * @dev Authorize a compute node
     * @param _node Address to authorize
     */
    function authorizeComputeNode(address _node) external onlyOwner whenNotPaused {
        require(_node != address(0), "Invalid address");
        require(!authorizedComputeNodes[_node], "Already authorized");

        authorizedComputeNodes[_node] = true;
        emit ComputeNodeAuthorized(_node);
    }

    /**
     * @dev Revoke compute node authorization
     * @param _node Address to revoke
     */
    function revokeComputeNode(address _node) external onlyOwner {
        require(authorizedComputeNodes[_node], "Not authorized");

        authorizedComputeNodes[_node] = false;
        emit ComputeNodeRevoked(_node);
    }

    /**
     * @dev Set token reward rate per successful inference
     */
    function setTokenRate(uint256 _newRate) external onlyOwner {
        uint256 previousRate = tokenRate;
        tokenRate = _newRate;
        emit TokenRateUpdated(previousRate, _newRate);
    }

    /**
     * @dev Set scoring weights used by off-chain evaluation logic
     */
    function setEvaluationWeights(
        uint256 _accuracy,
        uint256 _efficiency,
        uint256 _reliability,
        uint256 _responseTime
    ) external onlyOwner {
        require(
            _accuracy + _efficiency + _reliability + _responseTime > 0,
            "Invalid weights"
        );

        weightAccuracy = _accuracy;
        weightEfficiency = _efficiency;
        weightReliability = _reliability;
        weightResponseTime = _responseTime;

        emit EvaluationWeightsUpdated(_accuracy, _efficiency, _reliability, _responseTime);
    }

    /**
     * @dev Platform owner withdraws accumulated fees
     */
    function withdrawPlatformEarnings() external onlyOwner nonReentrant {
        uint256 amount = platformEarnings;
        require(amount > 0, "No earnings to withdraw");

        platformEarnings = 0;

        (bool ok, ) = payable(owner).call{value: amount}("");
        require(ok, "Platform withdrawal failed");

        emit PlatformEarningsWithdrawn(owner, amount);
    }

    /**
     * @dev Compute node withdraws accumulated earnings
     */
    function withdrawNodeEarnings() external nonReentrant {
        uint256 amount = nodeEarnings[msg.sender];
        require(amount > 0, "No earnings to withdraw");

        nodeEarnings[msg.sender] = 0;

        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "Node withdrawal failed");

        emit NodeEarningsWithdrawn(msg.sender, amount);
    }

    /**
     * @dev Model creator withdraws accrued inference earnings
     */
    function withdrawCreatorEarnings() external nonReentrant {
        uint256 amount = creatorEarnings[msg.sender];
        require(amount > 0, "No creator earnings");

        creatorEarnings[msg.sender] = 0;

        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "Creator withdrawal failed");

        emit CreatorEarningsWithdrawn(msg.sender, amount);
    }

    /**
     * @dev User withdraws refundable balance from failed or timed-out requests
     */
    function withdrawRefundableBalance() external nonReentrant {
        uint256 amount = refundableUserBalances[msg.sender];
        require(amount > 0, "No refundable balance");

        refundableUserBalances[msg.sender] = 0;

        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "Refund withdrawal failed");

        emit UserRefundWithdrawn(msg.sender, amount);
    }

    /**
     * @dev Get total number of requests
     * @return Total request count
     */
    function getTotalRequests() external view returns (uint256) {
        return requestCounter;
    }

    /**
     * @dev Pause state-changing operations
     */
    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    /**
     * @dev Unpause state-changing operations
     */
    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    /**
     * @dev Transfer ownership
     * @param _newOwner Address of new owner
     */
    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "Invalid address");

        address previousOwner = owner;
        owner = _newOwner;
        emit OwnershipTransferred(previousOwner, _newOwner);
    }

    // ============ Internal Helpers ============

    function _recoverSigner(bytes32 _proofHash, bytes memory _signature)
        internal
        pure
        returns (address)
    {
        require(_signature.length == 65, "Invalid signature length");

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := mload(add(_signature, 32))
            s := mload(add(_signature, 64))
            v := byte(0, mload(add(_signature, 96)))
        }

        if (v < 27) {
            v += 27;
        }
        require(v == 27 || v == 28, "Invalid signature v value");

        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", _proofHash)
        );

        return ecrecover(ethSignedMessageHash, v, r, s);
    }
}