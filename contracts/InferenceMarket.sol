// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title InferenceMarket
 * @dev Core marketplace for AI model inference requests and verification
 * @notice For Remix IDE - Import ModelRegistry or deploy separately
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
        uint256 createdAt;
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
        uint256 payment;           // Total payment in escrow
        bytes32 inputDataHash;     // Hash of input data (for verification)
        bytes32 resultHash;        // Hash of output (filled after computation)
        address computeNode;       // Node that processed the request
        uint256 createdAt;
        uint256 completedAt;
        RequestStatus status;
    }
    
    enum RequestStatus {
        PENDING,      // 0 - Payment locked, awaiting computation
        COMPUTING,    // 1 - Picked up by compute node
        COMPLETED,    // 2 - Verified and payment released
        FAILED,       // 3 - Verification failed
        REFUNDED,     // 4 - Timeout or error, user refunded
        DISPUTED      // 5 - User disputes result
    }
    
    // ============ State Variables ============
    
    IModelRegistry public modelRegistry;
    
    uint256 public requestCounter;
    uint256 public constant TIMEOUT_DURATION = 5 minutes;
    uint256 public constant PLATFORM_FEE_PERCENT = 5;      // 5% to platform
    uint256 public constant COMPUTE_NODE_FEE_PERCENT = 10; // 10% to compute node
    
    mapping(uint256 => InferenceRequest) public requests;
    mapping(address => uint256[]) public userRequests;
    mapping(address => bool) public authorizedComputeNodes;
    mapping(address => uint256) public nodeEarnings;
    
    address public owner;
    uint256 public platformEarnings;
    
    // ============ Events ============
    
    event InferenceRequested(
        uint256 indexed requestId,
        uint256 indexed modelId,
        address indexed user,
        bytes32 inputDataHash,
        uint256 payment
    );
    
    event InferenceComputing(
        uint256 indexed requestId,
        address indexed computeNode
    );
    
    event InferenceCompleted(
        uint256 indexed requestId,
        bytes32 resultHash,
        address computeNode
    );
    
    event InferenceFailed(
        uint256 indexed requestId,
        string reason
    );
    
    event PaymentReleased(
        uint256 indexed requestId,
        address indexed creator,
        address indexed computeNode,
        uint256 creatorAmount,
        uint256 nodeAmount,
        uint256 platformFee
    );
    
    event UserRefunded(
        uint256 indexed requestId,
        address indexed user,
        uint256 amount
    );
    
    event ComputeNodeAuthorized(address indexed node);
    event ComputeNodeRevoked(address indexed node);
    
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
    
    // ============ Constructor ============
    
    /**
     * @dev Initialize with ModelRegistry address
     * @param _modelRegistryAddress Address of deployed ModelRegistry contract
     */
    constructor(address _modelRegistryAddress) {
        require(_modelRegistryAddress != address(0), "Invalid registry address");
        owner = msg.sender;
        modelRegistry = IModelRegistry(_modelRegistryAddress);
        requestCounter = 0;
        
        // Owner is first authorized compute node
        authorizedComputeNodes[msg.sender] = true;
        emit ComputeNodeAuthorized(msg.sender);
    }
    
    // ============ Core Functions ============
    
    /**
     * @dev Create inference request and lock payment
     * @param _modelId Model to use for inference
     * @param _inputDataHash Keccak256 hash of the input data
     * @return newRequestId The ID of the created request
     * 
     * Example usage in Remix:
     * - Select model ID (e.g., 1)
     * - Generate hash: web3.utils.keccak256("your input text")
     * - Send value (check model price first)
     */
    function requestInference(
        uint256 _modelId,
        bytes32 _inputDataHash
    ) external payable returns (uint256) {
        
        // Verify model exists and is available
        require(modelRegistry.isModelAvailable(_modelId), "Model not available");
        
        // Get model details
        IModelRegistry.Model memory model = modelRegistry.getModel(_modelId);
        
        // Verify payment is sufficient
        require(msg.value >= model.pricePerInference, "Insufficient payment");
        
        // Create new request
        requestCounter++;
        uint256 newRequestId = requestCounter;
        
        requests[newRequestId] = InferenceRequest({
            requestId: newRequestId,
            modelId: _modelId,
            user: msg.sender,
            payment: msg.value,
            inputDataHash: _inputDataHash,
            resultHash: bytes32(0),
            computeNode: address(0),
            createdAt: block.timestamp,
            completedAt: 0,
            status: RequestStatus.PENDING
        });
        
        userRequests[msg.sender].push(newRequestId);
        
        emit InferenceRequested(
            newRequestId,
            _modelId,
            msg.sender,
            _inputDataHash,
            msg.value
        );
        
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
    {
        InferenceRequest storage request = requests[_requestId];
        
        require(request.status == RequestStatus.PENDING, "Request not pending");
        require(
            block.timestamp <= request.createdAt + TIMEOUT_DURATION,
            "Request timed out"
        );
        
        request.status = RequestStatus.COMPUTING;
        request.computeNode = msg.sender;
        
        emit InferenceComputing(_requestId, msg.sender);
    }
    
    /**
     * @dev Submit inference result with proof
     * @param _requestId Request ID
     * @param _resultHash Keccak256 hash of the result
     * @param _resultData Actual result data (for verification)
     * 
     * Example for spam detector:
     * - _resultData: "SPAM" or "NOT_SPAM"
     * - _resultHash: keccak256(abi.encodePacked("SPAM"))
     */
    function submitResult(
        uint256 _requestId,
        bytes32 _resultHash,
        string memory _resultData
    ) external onlyAuthorizedNode requestExists(_requestId) {
        
        InferenceRequest storage request = requests[_requestId];
        
        require(request.status == RequestStatus.COMPUTING, "Not in computing state");
        require(request.computeNode == msg.sender, "Not assigned to you");
        require(
            block.timestamp <= request.createdAt + TIMEOUT_DURATION,
            "Request timed out"
        );
        
        // Verify hash matches
        bytes32 computedHash = keccak256(abi.encodePacked(_resultData));
        require(computedHash == _resultHash, "Hash mismatch - proof invalid");
        
        // Update request
        request.resultHash = _resultHash;
        request.completedAt = block.timestamp;
        request.status = RequestStatus.COMPLETED;
        
        // Release payment
        _releasePayment(_requestId);
        
        emit InferenceCompleted(_requestId, _resultHash, msg.sender);
    }
    
    /**
     * @dev Internal function to distribute payment
     * Payment split: 85% creator, 10% compute node, 5% platform
     */
    function _releasePayment(uint256 _requestId) internal {
        InferenceRequest storage request = requests[_requestId];
        uint256 totalPayment = request.payment;
        
        // Calculate payment splits
        uint256 platformFee = (totalPayment * PLATFORM_FEE_PERCENT) / 100;
        uint256 nodeFee = (totalPayment * COMPUTE_NODE_FEE_PERCENT) / 100;
        uint256 creatorPayment = totalPayment - platformFee - nodeFee;
        
        // Get model creator address
        IModelRegistry.Model memory model = modelRegistry.getModel(request.modelId);
        address creator = model.creator;
        
        // Accumulate platform earnings
        platformEarnings += platformFee;
        nodeEarnings[request.computeNode] += nodeFee;
        
        // Transfer to creator and node
        payable(creator).transfer(creatorPayment);
        payable(request.computeNode).transfer(nodeFee);
        
        // Update model statistics in registry
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
    {
        InferenceRequest storage request = requests[_requestId];
        
        require(request.user == msg.sender, "Not your request");
        require(
            request.status == RequestStatus.PENDING || 
            request.status == RequestStatus.COMPUTING,
            "Cannot refund in current state"
        );
        require(
            block.timestamp > request.createdAt + TIMEOUT_DURATION,
            "Not timed out yet - wait 5 minutes"
        );
        
        // Process refund
        uint256 refundAmount = request.payment;
        request.status = RequestStatus.REFUNDED;
        request.payment = 0;
        
        payable(msg.sender).transfer(refundAmount);
        
        emit UserRefunded(_requestId, msg.sender, refundAmount);
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
    {
        InferenceRequest storage request = requests[_requestId];
        
        require(request.computeNode == msg.sender, "Not your request");
        require(request.status == RequestStatus.COMPUTING, "Not in computing state");
        
        request.status = RequestStatus.FAILED;
        
        // Refund user
        uint256 refundAmount = request.payment;
        request.payment = 0;
        payable(request.user).transfer(refundAmount);
        
        // Penalize model (slash 0.001 ETH from stake)
        modelRegistry.penalizeModel(request.modelId, 0.001 ether);
        
        emit InferenceFailed(_requestId, _reason);
        emit UserRefunded(_requestId, request.user, refundAmount);
    }
    
    // ============ View Functions ============
    
    /**
     * @dev Get complete request details
     * @param _requestId Request ID
     * @return InferenceRequest struct
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
     * @param _user User address
     * @return Array of request IDs
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
     * @return Array of pending request IDs
     */
    function getPendingRequests() external view returns (uint256[] memory) {
        uint256 pendingCount = 0;
        
        // Count pending requests that haven't timed out
        for (uint256 i = 1; i <= requestCounter; i++) {
            if (requests[i].status == RequestStatus.PENDING &&
                block.timestamp <= requests[i].createdAt + TIMEOUT_DURATION) {
                pendingCount++;
            }
        }
        
        // Build array of pending request IDs
        uint256[] memory pending = new uint256[](pendingCount);
        uint256 index = 0;
        
        for (uint256 i = 1; i <= requestCounter; i++) {
            if (requests[i].status == RequestStatus.PENDING &&
                block.timestamp <= requests[i].createdAt + TIMEOUT_DURATION) {
                pending[index] = i;
                index++;
            }
        }
        
        return pending;
    }
    
    /**
     * @dev Get request status as string
     * @param _requestId Request ID
     * @return Status as string
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
    function authorizeComputeNode(address _node) external onlyOwner {
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
     * @dev Platform owner withdraws accumulated fees
     */
    function withdrawPlatformEarnings() external onlyOwner {
        uint256 amount = platformEarnings;
        require(amount > 0, "No earnings to withdraw");
        
        platformEarnings = 0;
        payable(owner).transfer(amount);
    }
    
    /**
     * @dev Compute node withdraws accumulated earnings
     */
    function withdrawNodeEarnings() external {
        uint256 amount = nodeEarnings[msg.sender];
        require(amount > 0, "No earnings to withdraw");
        
        nodeEarnings[msg.sender] = 0;
        payable(msg.sender).transfer(amount);
    }
    
    /**
     * @dev Get total number of requests
     * @return Total request count
     */
    function getTotalRequests() external view returns (uint256) {
        return requestCounter;
    }
    
    /**
     * @dev Transfer ownership
     * @param _newOwner Address of new owner
     */
    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "Invalid address");
        owner = _newOwner;
    }
}