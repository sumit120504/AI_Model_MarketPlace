// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ModelRegistry
 * @dev Manages AI model registration, metadata, and lifecycle
 * @notice For Remix IDE - All contracts in single file or use proper imports
 */
contract ModelRegistry {
    
    // ============ Structs ============
    
    struct Model {
        uint256 modelId;
        address creator;
        string ipfsHash;           // Model file location on IPFS
        string name;
        string description;
        ModelCategory category;
        uint256 pricePerInference; // Price in wei
        uint256 creatorStake;      // Stake deposited by creator
        uint256 totalInferences;
        uint256 totalEarnings;
        uint256 reputationScore;   // 0-1000 scale
        uint256 createdAt;
        bool isActive;
    }
    
    enum ModelCategory {
        TEXT_CLASSIFICATION,  // 0 - For spam detector
        IMAGE_CLASSIFICATION, // 1
        SENTIMENT_ANALYSIS,   // 2
        OTHER                 // 3
    }
    
    // ============ State Variables ============
    
    uint256 public modelCounter;
    uint256 public constant MIN_STAKE = 0.01 ether;  // Minimum stake required
    uint256 public constant PLATFORM_FEE_PERCENT = 5; // 5% platform fee
    
    mapping(uint256 => Model) public models;
    mapping(address => uint256[]) public creatorModels;
    
    address public owner;
    address public marketplaceContract; // InferenceMarket contract address
    
    // ============ Events ============
    
    event ModelRegistered(
        uint256 indexed modelId,
        address indexed creator,
        string name,
        uint256 pricePerInference
    );
    
    event ModelUpdated(uint256 indexed modelId, uint256 newPrice);
    event ModelDeactivated(uint256 indexed modelId);
    event ModelActivated(uint256 indexed modelId);
    event ReputationUpdated(uint256 indexed modelId, uint256 newScore);
    event StakeAdded(uint256 indexed modelId, uint256 amount);
    event StakeWithdrawn(uint256 indexed modelId, uint256 amount);
    
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
    
    // ============ Constructor ============
    
    constructor() {
        owner = msg.sender;
        modelCounter = 0;
    }
    
    // ============ Core Functions ============
    
    /**
     * @dev Register a new AI model
     * @param _ipfsHash IPFS hash of the model file (e.g., "QmXxx...")
     * @param _name Model name (e.g., "Spam Detector Pro")
     * @param _description Model description
     * @param _category Model category (0=TEXT, 1=IMAGE, 2=SENTIMENT, 3=OTHER)
     * @param _pricePerInference Price per inference in wei (e.g., 1000000000000000 = 0.001 ETH)
     * @return newModelId The ID of the newly registered model
     */
    function registerModel(
        string memory _ipfsHash,
        string memory _name,
        string memory _description,
        ModelCategory _category,
        uint256 _pricePerInference
    ) external payable returns (uint256) {
        require(msg.value >= MIN_STAKE, "Insufficient stake: minimum 0.01 ETH required");
        require(bytes(_ipfsHash).length > 0, "Invalid IPFS hash");
        require(bytes(_name).length > 0, "Name required");
        require(_pricePerInference > 0, "Price must be greater than 0");
        
        modelCounter++;
        uint256 newModelId = modelCounter;
        
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
            reputationScore: 500, // Start at 50% (neutral)
            createdAt: block.timestamp,
            isActive: true
        });
        
        creatorModels[msg.sender].push(newModelId);
        
        emit ModelRegistered(newModelId, msg.sender, _name, _pricePerInference);
        
        return newModelId;
    }
    
    /**
     * @dev Update model price
     * @param _modelId ID of the model to update
     * @param _newPrice New price in wei
     */
    function updatePrice(uint256 _modelId, uint256 _newPrice) 
        external 
        onlyCreator(_modelId) 
        modelExists(_modelId) 
    {
        require(_newPrice > 0, "Price must be greater than 0");
        models[_modelId].pricePerInference = _newPrice;
        emit ModelUpdated(_modelId, _newPrice);
    }
    
    /**
     * @dev Deactivate model (can be reactivated later)
     * @param _modelId ID of the model to deactivate
     */
    function deactivateModel(uint256 _modelId) 
        external 
        onlyCreator(_modelId) 
        modelExists(_modelId) 
    {
        models[_modelId].isActive = false;
        emit ModelDeactivated(_modelId);
    }
    
    /**
     * @dev Reactivate a previously deactivated model
     * @param _modelId ID of the model to activate
     */
    function activateModel(uint256 _modelId) 
        external 
        onlyCreator(_modelId) 
        modelExists(_modelId) 
    {
        models[_modelId].isActive = true;
        emit ModelActivated(_modelId);
    }
    
    /**
     * @dev Add more stake to your model
     * @param _modelId ID of the model
     */
    function addStake(uint256 _modelId) 
        external 
        payable 
        onlyCreator(_modelId) 
        modelExists(_modelId) 
    {
        require(msg.value > 0, "Must send ETH");
        models[_modelId].creatorStake += msg.value;
        emit StakeAdded(_modelId, msg.value);
    }
    
    /**
     * @dev Withdraw stake (only if model has good reputation)
     * @param _modelId ID of the model
     * @param _amount Amount to withdraw in wei
     */
    function withdrawStake(uint256 _modelId, uint256 _amount) 
        external 
        onlyCreator(_modelId) 
        modelExists(_modelId) 
    {
        Model storage model = models[_modelId];
        require(model.creatorStake >= _amount, "Insufficient stake");
        require(model.reputationScore >= 400, "Reputation too low to withdraw (min 400/1000)");
        require(model.creatorStake - _amount >= MIN_STAKE, "Must maintain minimum stake");
        
        model.creatorStake -= _amount;
        (bool success, ) = payable(msg.sender).call{value: _amount}("");
        require(success, "Stake withdrawal transfer failed");
        
        emit StakeWithdrawn(_modelId, _amount);
    }
    
    // ============ Marketplace Functions (Called by InferenceMarket) ============
    
    /**
     * @dev Record successful inference (called by marketplace contract)
     * @param _modelId ID of the model used
     * @param _payment Payment amount for this inference
     */
    function recordInference(uint256 _modelId, uint256 _payment) 
        external 
        onlyMarketplace 
        modelExists(_modelId) 
    {
        models[_modelId].totalInferences++;
        models[_modelId].totalEarnings += _payment;
        
        // Improve reputation on successful inference (max 1000)
        if (models[_modelId].reputationScore < 1000) {
            models[_modelId].reputationScore += 1;
        }
    }
    
    /**
     * @dev Penalize model for fraud/failure (called by marketplace)
     * @param _modelId ID of the model to penalize
     * @param _slashAmount Amount of stake to slash
     */
    function penalizeModel(uint256 _modelId, uint256 _slashAmount) 
        external 
        onlyMarketplace 
        modelExists(_modelId) 
    {
        Model storage model = models[_modelId];
        
        // Decrease reputation significantly
        if (model.reputationScore >= 50) {
            model.reputationScore -= 50;
        } else {
            model.reputationScore = 0;
        }
        
        // Slash stake
        if (model.creatorStake >= _slashAmount) {
            model.creatorStake -= _slashAmount;
            // Transfer slashed amount to platform owner
            (bool success, ) = payable(owner).call{value: _slashAmount}("");
            require(success, "Slash transfer failed");
        }
        
        // Deactivate if reputation too low
        if (model.reputationScore < 200) {
            model.isActive = false;
        }
        
        emit ReputationUpdated(_modelId, model.reputationScore);
    }
    
    // ============ View Functions ============
    
    /**
     * @dev Get complete model details
     * @param _modelId ID of the model
     * @return Model struct with all details
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
     * @param _creator Address of the creator
     * @return Array of model IDs
     */
    function getCreatorModels(address _creator) 
        external 
        view 
        returns (uint256[] memory) 
    {
        return creatorModels[_creator];
    }
    
    /**
     * @dev Get all active models in the marketplace
     * @return Array of active model IDs
     */
    function getActiveModels() external view returns (uint256[] memory) {
        uint256 activeCount = 0;
        
        // Count active models
        for (uint256 i = 1; i <= modelCounter; i++) {
            if (models[i].isActive) {
                activeCount++;
            }
        }
        
        // Create array of active model IDs
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
     * @param _modelId ID of the model
     * @return bool True if active and properly staked
     */
    function isModelAvailable(uint256 _modelId) 
        external 
        view 
        modelExists(_modelId) 
        returns (bool) 
    {
        return models[_modelId].isActive && models[_modelId].creatorStake >= MIN_STAKE;
    }
    
    /**
     * @dev Get total number of models registered
     * @return uint256 Total model count
     */
    function getTotalModels() external view returns (uint256) {
        return modelCounter;
    }
    
    // ============ Admin Functions ============
    
    /**
     * @dev Set marketplace contract address (one-time setup)
     * @param _marketplaceContract Address of InferenceMarket contract
     */
    function setMarketplaceContract(address _marketplaceContract) 
        external 
        onlyOwner 
    {
        require(_marketplaceContract != address(0), "Invalid address");
        require(marketplaceContract == address(0), "Already set");
        marketplaceContract = _marketplaceContract;
    }
    
    /**
     * @dev Emergency pause a model (admin only)
     * @param _modelId ID of the model to pause
     */
    function emergencyPause(uint256 _modelId) 
        external 
        onlyOwner 
        modelExists(_modelId) 
    {
        models[_modelId].isActive = false;
        emit ModelDeactivated(_modelId);
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