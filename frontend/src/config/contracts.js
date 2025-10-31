// Contract addresses (update with your deployed addresses)
export const CONTRACTS = {
  MODEL_REGISTRY: import.meta.env.VITE_MODEL_REGISTRY_ADDRESS || "0x31bf20a858Ad971121DF5d6C0200bDe589c90D4a",
  INFERENCE_MARKET: import.meta.env.VITE_INFERENCE_MARKET_ADDRESS || "0x0000000000000000000000000000000000000000",
};

// Network configuration
export const NETWORK = {
  chainId: parseInt(import.meta.env.VITE_CHAIN_ID, 10) || 80002,
  name: import.meta.env.VITE_CHAIN_NAME || "Amoy",
  rpcUrl: import.meta.env.VITE_RPC_URL || "https://rpc-amoy.polygon.technology",
  blockExplorer: import.meta.env.VITE_BLOCK_EXPLORER || "https://amoy.polygonscan.com",
  nativeCurrency: {
    name: "MATIC",
    symbol: "MATIC",
    decimals: 18
  }
};

// Backend API URL
export const BACKEND_API_URL = import.meta.env.VITE_BACKEND_API_URL || "http://localhost:3001";

// Contract ABIs (minimal - only functions we need)
export const MODEL_REGISTRY_ABI = [
  "function getModel(uint256 _modelId) external view returns (tuple(uint256 modelId, address creator, string ipfsHash, string name, string description, uint8 category, uint256 pricePerInference, uint256 creatorStake, uint256 totalInferences, uint256 totalEarnings, uint256 reputationScore, uint256 createdAt, bool isActive))",
  "function getActiveModels() external view returns (uint256[] memory)",
  "function getTotalModels() external view returns (uint256)",
  "function registerModel(string memory _ipfsHash, string memory _name, string memory _description, uint8 _category, uint256 _pricePerInference) external payable returns (uint256)",
  "function getCreatorModels(address _creator) external view returns (uint256[] memory)",
  "function updatePrice(uint256 _modelId, uint256 _newPrice) external",
  "function deactivateModel(uint256 _modelId) external",
  "function activateModel(uint256 _modelId) external",
  // Admin functions
  "function owner() external view returns (address)",
  "function isAdmin(address _address) external view returns (bool)",
  "function addAdmin(address _admin) external",
  "function removeAdmin(address _admin) external",
  "function getAllModels() external view returns (uint256[] memory)"
];

export const INFERENCE_MARKET_ABI = [
  "function requestInference(uint256 _modelId, bytes32 _inputDataHash) external payable returns (uint256)",
  "function getRequest(uint256 _requestId) external view returns (tuple(uint256 requestId, uint256 modelId, address user, uint256 payment, bytes32 inputDataHash, bytes32 resultHash, address computeNode, uint256 createdAt, uint256 completedAt, uint8 status))",
  "function getUserRequests(address _user) external view returns (uint256[] memory)",
  "function getPendingRequests() external view returns (uint256[] memory)",
  "function getRequestStatus(uint256 _requestId) external view returns (string memory)",
  "event InferenceRequested(uint256 indexed requestId, uint256 indexed modelId, address indexed user, bytes32 inputDataHash, uint256 payment)",
  "event InferenceCompleted(uint256 indexed requestId, bytes32 resultHash, address computeNode)"
];

// Model categories
export const MODEL_CATEGORIES = {
  0: "Text Classification",
  1: "Image Classification",
  2: "Sentiment Analysis",
  3: "Other"
};

// Request status
export const REQUEST_STATUS = {
  0: { label: "Pending", color: "yellow" },
  1: { label: "Computing", color: "blue" },
  2: { label: "Completed", color: "green" },
  3: { label: "Failed", color: "red" },
  4: { label: "Refunded", color: "gray" },
  5: { label: "Disputed", color: "orange" }
};

// Helper functions
export function formatAddress(address) {
  if (!address) return "";
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

export function formatEther(wei) {
  if (!wei) return "0";
  return (parseFloat(wei) / 1e18).toFixed(4);
}

export function getCategoryName(categoryId) {
  return MODEL_CATEGORIES[categoryId] || "Unknown";
}

export function getStatusInfo(statusId) {
  return REQUEST_STATUS[statusId] || { label: "Unknown", color: "gray" };
}