// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ModelRegistry
 * @dev Manages AI model registration, versioning, pricing and stake lifecycle
 */
contract ModelRegistry {

    // ============ Structs ============

    struct Model {
        uint256 modelId;
        address creator;
        string ipfsHash; // Active model file location on IPFS
        string name;
        string description;
        ModelCategory category;
        uint256 pricePerInference;
        uint256 creatorStake;
        uint256 totalInferences;
        uint256 totalEarnings;
        uint256 reputationScore; // 0-1000 scale
        uint256 evaluationScore; // 0-1000 scale, set by platform logic
        uint256 createdAt;
        uint256 updatedAt;
        uint256 currentVersion;
        uint256 lastPriceUpdate;
        uint256 deactivatedAt;
        bytes32 currentProvenanceHash;
        bool isActive;
    }

    struct VersionEntry {
        uint256 version;
        string ipfsHash;
        bytes32 provenanceHash;
        uint256 timestamp;
    }

    enum ModelCategory {
        TEXT_CLASSIFICATION, // 0
        IMAGE_CLASSIFICATION, // 1
        REGRESSION, // 2
        OTHER // 3
    }

    // ============ State Variables ============

    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    uint256 public modelCounter;
    uint256 public constant MIN_STAKE = 0.01 ether;
    uint256 public constant PRICE_UPDATE_COOLDOWN = 15 minutes;
    uint256 public constant STAKE_WITHDRAW_COOLDOWN = 1 days;

    mapping(uint256 => Model) public models;
    mapping(uint256 => VersionEntry[]) private _modelVersions;
    mapping(address => uint256[]) public creatorModels;

    address public owner;
    address public marketplaceContract;
    bool public paused;
    uint256 private _status;

    // ============ Events ============

    event ModelRegistered(
        uint256 indexed modelId,
        address indexed creator,
        string name,
        uint256 pricePerInference
    );

    event ModelVersionAdded(
        uint256 indexed modelId,
        uint256 indexed version,
        string ipfsHash,
        bytes32 provenanceHash
    );
    event ModelPriceUpdated(uint256 indexed modelId, uint256 oldPrice, uint256 newPrice);
    event ModelMetadataUpdated(uint256 indexed modelId, string ipfsHash, string description);
    event ModelDeactivated(uint256 indexed modelId);
    event ModelActivated(uint256 indexed modelId);
    event ReputationUpdated(uint256 indexed modelId, uint256 newScore);
    event EvaluationScoreUpdated(uint256 indexed modelId, uint256 newScore);
    event StakeAdded(uint256 indexed modelId, uint256 amount);
    event StakeWithdrawn(uint256 indexed modelId, uint256 amount);
    event MarketplaceContractUpdated(address indexed marketplaceContract);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Paused(address indexed account);
    event Unpaused(address indexed account);

    // ============ Modifiers ============

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    modifier onlyCreator(uint256 _modelId) {
        require(models[_modelId].creator == msg.sender, "Not model creator");
        _;
    }

    modifier onlyMarketplace() {
        require(msg.sender == marketplaceContract, "Only marketplace can call");
        _;
    }

    modifier modelExists(uint256 _modelId) {
        require(models[_modelId].creator != address(0), "Model does not exist");
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

    constructor() {
        owner = msg.sender;
        _status = _NOT_ENTERED;
    }

    // ============ Core Functions ============

    /**
     * @dev Register a new AI model
     * @param _ipfsHash IPFS hash/CID of encrypted model payload
     * @param _name Model name
     * @param _description Model description
     * @param _category Model category
     * @param _pricePerInference Price per inference in wei
     * @return newModelId The ID of the newly registered model
     */
    function registerModel(
        string memory _ipfsHash,
        string memory _name,
        string memory _description,
        ModelCategory _category,
        uint256 _pricePerInference
    ) external payable returns (uint256) {
        require(msg.value >= MIN_STAKE, "Insufficient stake");
        require(bytes(_ipfsHash).length > 0, "Invalid IPFS hash");
        require(bytes(_name).length > 0, "Name required");
        require(_pricePerInference > 0, "Invalid price");

        modelCounter++;
        uint256 newModelId = modelCounter;

        bytes32 provenanceHash = _computeProvenanceHash(
            newModelId,
            msg.sender,
            block.timestamp,
            1
        );

        models[newModelId] = Model({
            modelId: newModelId,
            creator: msg.sender,
            ipfsHash: _ipfsHash,
            name: _name,
            description: _description,
            category: _category,
            pricePerInference: _pricePerInference,
            creatorStake: msg.value,
            totalInferences: 0,
            totalEarnings: 0,
            reputationScore: 500,
            evaluationScore: 500,
            createdAt: block.timestamp,
            updatedAt: block.timestamp,
            currentVersion: 1,
            lastPriceUpdate: block.timestamp,
            deactivatedAt: 0,
            currentProvenanceHash: provenanceHash,
            isActive: true
        });

        _modelVersions[newModelId].push(
            VersionEntry({
                version: 1,
                ipfsHash: _ipfsHash,
                provenanceHash: provenanceHash,
                timestamp: block.timestamp
            })
        );

        creatorModels[msg.sender].push(newModelId);

        emit ModelRegistered(newModelId, msg.sender, _name, _pricePerInference);
        emit ModelVersionAdded(newModelId, 1, _ipfsHash, provenanceHash);

        return newModelId;
    }

    /**
     * @dev Update the active model artifact and append version provenance
     */
    function updateModel(
        uint256 _modelId,
        string memory _newIpfsHash,
        string memory _newDescription
    )
        external
        onlyCreator(_modelId)
        modelExists(_modelId)
        whenNotPaused
    {
        Model storage model = models[_modelId];

        require(bytes(_newIpfsHash).length > 0, "Invalid IPFS hash");
        require(model.isActive, "Model inactive");

        uint256 nextVersion = model.currentVersion + 1;
        bytes32 provenanceHash = _computeProvenanceHash(
            _modelId,
            msg.sender,
            block.timestamp,
            nextVersion
        );

        model.ipfsHash = _newIpfsHash;
        model.description = _newDescription;
        model.updatedAt = block.timestamp;
        model.currentVersion = nextVersion;
        model.currentProvenanceHash = provenanceHash;

        _modelVersions[_modelId].push(
            VersionEntry({
                version: nextVersion,
                ipfsHash: _newIpfsHash,
                provenanceHash: provenanceHash,
                timestamp: block.timestamp
            })
        );

        emit ModelMetadataUpdated(_modelId, _newIpfsHash, _newDescription);
        emit ModelVersionAdded(_modelId, nextVersion, _newIpfsHash, provenanceHash);
    }

    /**
     * @dev Update model price with a cooldown to avoid manipulation
     */
    function updatePrice(uint256 _modelId, uint256 _newPrice)
        external 
        onlyCreator(_modelId) 
        modelExists(_modelId)
        whenNotPaused
    {
        Model storage model = models[_modelId];

        require(_newPrice > 0, "Invalid price");
        require(
            block.timestamp >= model.lastPriceUpdate + PRICE_UPDATE_COOLDOWN,
            "Price cooldown active"
        );

        uint256 oldPrice = model.pricePerInference;
        model.pricePerInference = _newPrice;
        model.lastPriceUpdate = block.timestamp;
        model.updatedAt = block.timestamp;

        emit ModelPriceUpdated(_modelId, oldPrice, _newPrice);
    }

    /**
     * @dev Deactivate model to stop new inference requests
     */
    function deactivateModel(uint256 _modelId)
        external 
        onlyCreator(_modelId) 
        modelExists(_modelId)
        whenNotPaused
    {
        Model storage model = models[_modelId];

        require(model.isActive, "Already inactive");
        model.isActive = false;
        model.deactivatedAt = block.timestamp;
        model.updatedAt = block.timestamp;

        emit ModelDeactivated(_modelId);
    }

    /**
     * @dev Reactivate a previously deactivated model
     */
    function activateModel(uint256 _modelId)
        external 
        onlyCreator(_modelId) 
        modelExists(_modelId)
        whenNotPaused
    {
        Model storage model = models[_modelId];

        require(!model.isActive, "Already active");
        require(model.creatorStake >= MIN_STAKE, "Insufficient stake");

        model.isActive = true;
        model.updatedAt = block.timestamp;

        emit ModelActivated(_modelId);
    }

    /**
     * @dev Add more stake to your model
     */
    function addStake(uint256 _modelId)
        external 
        payable 
        onlyCreator(_modelId) 
        modelExists(_modelId)
        whenNotPaused
    {
        require(msg.value > 0, "Must send ETH");

        models[_modelId].creatorStake += msg.value;
        models[_modelId].updatedAt = block.timestamp;

        emit StakeAdded(_modelId, msg.value);
    }

    /**
     * @dev Withdraw stake after deactivation cooldown window
     */
    function withdrawStake(uint256 _modelId, uint256 _amount)
        external 
        onlyCreator(_modelId) 
        modelExists(_modelId)
        whenNotPaused
        nonReentrant
    {
        Model storage model = models[_modelId];

        require(!model.isActive, "Deactivate model first");
        require(model.deactivatedAt > 0, "Model not deactivated");
        require(
            block.timestamp >= model.deactivatedAt + STAKE_WITHDRAW_COOLDOWN,
            "Withdrawal cooldown active"
        );
        require(model.creatorStake >= _amount, "Insufficient stake");

        model.creatorStake -= _amount;

        (bool ok, ) = payable(msg.sender).call{value: _amount}("");
        require(ok, "Stake transfer failed");

        emit StakeWithdrawn(_modelId, _amount);
    }

    // ============ Marketplace Functions (Called by InferenceMarket) ============

    /**
     * @dev Record successful inference (called by marketplace contract)
     */
    function recordInference(uint256 _modelId, uint256 _payment)
        external 
        onlyMarketplace 
        modelExists(_modelId)
        whenNotPaused
    {
        Model storage model = models[_modelId];

        model.totalInferences += 1;
        model.totalEarnings += _payment;
        model.updatedAt = block.timestamp;

        if (model.reputationScore < 1000) {
            model.reputationScore += 1;
            emit ReputationUpdated(_modelId, model.reputationScore);
        }
    }

    /**
     * @dev Penalize model for fraud/failure (called by marketplace)
     */
    function penalizeModel(uint256 _modelId, uint256 _slashAmount)
        external 
        onlyMarketplace 
        modelExists(_modelId)
        whenNotPaused
        nonReentrant
    {
        Model storage model = models[_modelId];

        if (model.reputationScore >= 50) {
            model.reputationScore -= 50;
        } else {
            model.reputationScore = 0;
        }

        uint256 slashAmount = _slashAmount;
        if (slashAmount > model.creatorStake) {
            slashAmount = model.creatorStake;
        }
        if (slashAmount > 0) {
            model.creatorStake -= slashAmount;
            (bool ok, ) = payable(owner).call{value: slashAmount}("");
            require(ok, "Slash transfer failed");
        }

        if (model.reputationScore < 200) {
            model.isActive = false;
            model.deactivatedAt = block.timestamp;
            emit ModelDeactivated(_modelId);
        }

        model.updatedAt = block.timestamp;
        emit ReputationUpdated(_modelId, model.reputationScore);
    }

    /**
     * @dev Admin updates off-chain computed evaluation score
     */
    function setEvaluationScore(uint256 _modelId, uint256 _score)
        external
        onlyOwner
        modelExists(_modelId)
    {
        require(_score <= 1000, "Score out of range");

        models[_modelId].evaluationScore = _score;
        models[_modelId].updatedAt = block.timestamp;

        emit EvaluationScoreUpdated(_modelId, _score);
    }

    // ============ View Functions ============

    /**
     * @dev Get complete model details
     */
    function getModel(uint256 _modelId)
        external 
        view 
        modelExists(_modelId) 
        returns (Model memory)
    {
        return models[_modelId];
    }

    /**
     * @dev Get all model IDs created by an address
     */
    function getCreatorModels(address _creator)
        external 
        view 
        returns (uint256[] memory)
    {
        return creatorModels[_creator];
    }

    /**
     * @dev Return full version history for a model
     */
    function getModelVersions(uint256 _modelId)
        external
        view
        modelExists(_modelId)
        returns (VersionEntry[] memory)
    {
        return _modelVersions[_modelId];
    }

    /**
     * @dev Return current provenance hash for active model version
     */
    function getCurrentProvenanceHash(uint256 _modelId)
        external
        view
        modelExists(_modelId)
        returns (bytes32)
    {
        return models[_modelId].currentProvenanceHash;
    }

    /**
     * @dev Get all active models in the marketplace
     */
    function getActiveModels() external view returns (uint256[] memory) {
        uint256 activeCount = 0;

        for (uint256 i = 1; i <= modelCounter; i++) {
            if (models[i].isActive) {
                activeCount++;
            }
        }

        uint256[] memory activeModels = new uint256[](activeCount);
        uint256 index = 0;

        for (uint256 i = 1; i <= modelCounter; i++) {
            if (models[i].isActive) {
                activeModels[index] = i;
                index++;
            }
        }

        return activeModels;
    }

    /**
     * @dev Check if model is available for inference
     */
    function isModelAvailable(uint256 _modelId)
        external 
        view 
        modelExists(_modelId) 
        returns (bool)
    {
        Model memory model = models[_modelId];
        return model.isActive && model.creatorStake >= MIN_STAKE;
    }

    /**
     * @dev Get total number of models registered
     */
    function getTotalModels() external view returns (uint256) {
        return modelCounter;
    }

    // ============ Admin Functions ============

    /**
     * @dev Set marketplace contract address
     */
    function setMarketplaceContract(address _marketplaceContract) external onlyOwner {
        require(_marketplaceContract != address(0), "Invalid address");

        marketplaceContract = _marketplaceContract;
        emit MarketplaceContractUpdated(_marketplaceContract);
    }

    /**
     * @dev Emergency pause a model (admin only)
     */
    function emergencyPauseModel(uint256 _modelId) external onlyOwner modelExists(_modelId) {
        models[_modelId].isActive = false;
        models[_modelId].deactivatedAt = block.timestamp;
        models[_modelId].updatedAt = block.timestamp;
        emit ModelDeactivated(_modelId);
    }

    /**
     * @dev Backward-compatible alias.
     */
    function emergencyPause(uint256 _modelId) external onlyOwner modelExists(_modelId) {
        models[_modelId].isActive = false;
        models[_modelId].deactivatedAt = block.timestamp;
        models[_modelId].updatedAt = block.timestamp;
        emit ModelDeactivated(_modelId);
    }

    /**
     * @dev Pause all state-changing operations
     */
    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    /**
     * @dev Resume operations
     */
    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    /**
     * @dev Transfer ownership
     */
    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "Invalid address");

        address previousOwner = owner;
        owner = _newOwner;
        emit OwnershipTransferred(previousOwner, _newOwner);
    }

    // ============ Internal Helpers ============

    function _computeProvenanceHash(
        uint256 _modelId,
        address _creator,
        uint256 _timestamp,
        uint256 _version
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_modelId, _creator, _timestamp, _version));
    }
}