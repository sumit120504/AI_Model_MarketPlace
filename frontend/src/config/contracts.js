// Contract addresses (update with your deployed addresses)
export const CONTRACTS = {
  MODEL_REGISTRY: import.meta.env.VITE_MODEL_REGISTRY_ADDRESS ,
  INFERENCE_MARKET: import.meta.env.VITE_INFERENCE_MARKET_ADDRESS,
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
	{
		"inputs": [],
		"stateMutability": "nonpayable",
		"type": "constructor"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "uint256",
				"name": "modelId",
				"type": "uint256"
			}
		],
		"name": "ModelActivated",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "uint256",
				"name": "modelId",
				"type": "uint256"
			}
		],
		"name": "ModelDeactivated",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "uint256",
				"name": "modelId",
				"type": "uint256"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "creator",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "string",
				"name": "name",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "pricePerInference",
				"type": "uint256"
			}
		],
		"name": "ModelRegistered",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "uint256",
				"name": "modelId",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "newPrice",
				"type": "uint256"
			}
		],
		"name": "ModelUpdated",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "uint256",
				"name": "modelId",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "newScore",
				"type": "uint256"
			}
		],
		"name": "ReputationUpdated",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "uint256",
				"name": "modelId",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "StakeAdded",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "uint256",
				"name": "modelId",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "StakeWithdrawn",
		"type": "event"
	},
	{
		"inputs": [],
		"name": "MIN_STAKE",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "PLATFORM_FEE_PERCENT",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "_modelId",
				"type": "uint256"
			}
		],
		"name": "activateModel",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "_modelId",
				"type": "uint256"
			}
		],
		"name": "addStake",
		"outputs": [],
		"stateMutability": "payable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			},
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"name": "creatorModels",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "_modelId",
				"type": "uint256"
			}
		],
		"name": "deactivateModel",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "_modelId",
				"type": "uint256"
			}
		],
		"name": "emergencyPause",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "getActiveModels",
		"outputs": [
			{
				"internalType": "uint256[]",
				"name": "",
				"type": "uint256[]"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "_creator",
				"type": "address"
			}
		],
		"name": "getCreatorModels",
		"outputs": [
			{
				"internalType": "uint256[]",
				"name": "",
				"type": "uint256[]"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "_modelId",
				"type": "uint256"
			}
		],
		"name": "getModel",
		"outputs": [
			{
				"components": [
					{
						"internalType": "uint256",
						"name": "modelId",
						"type": "uint256"
					},
					{
						"internalType": "address",
						"name": "creator",
						"type": "address"
					},
					{
						"internalType": "string",
						"name": "ipfsHash",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "name",
						"type": "string"
					},
					{
						"internalType": "string",
						"name": "description",
						"type": "string"
					},
					{
						"internalType": "enum ModelRegistry.ModelCategory",
						"name": "category",
						"type": "uint8"
					},
					{
						"internalType": "uint256",
						"name": "pricePerInference",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "creatorStake",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "totalInferences",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "totalEarnings",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "reputationScore",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "createdAt",
						"type": "uint256"
					},
					{
						"internalType": "bool",
						"name": "isActive",
						"type": "bool"
					}
				],
				"internalType": "struct ModelRegistry.Model",
				"name": "",
				"type": "tuple"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "getTotalModels",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "_modelId",
				"type": "uint256"
			}
		],
		"name": "isModelAvailable",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "marketplaceContract",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "modelCounter",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"name": "models",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "modelId",
				"type": "uint256"
			},
			{
				"internalType": "address",
				"name": "creator",
				"type": "address"
			},
			{
				"internalType": "string",
				"name": "ipfsHash",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "name",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "description",
				"type": "string"
			},
			{
				"internalType": "enum ModelRegistry.ModelCategory",
				"name": "category",
				"type": "uint8"
			},
			{
				"internalType": "uint256",
				"name": "pricePerInference",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "creatorStake",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "totalInferences",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "totalEarnings",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "reputationScore",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "createdAt",
				"type": "uint256"
			},
			{
				"internalType": "bool",
				"name": "isActive",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "owner",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "_modelId",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "_slashAmount",
				"type": "uint256"
			}
		],
		"name": "penalizeModel",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "_modelId",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "_payment",
				"type": "uint256"
			}
		],
		"name": "recordInference",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "_ipfsHash",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_name",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_description",
				"type": "string"
			},
			{
				"internalType": "enum ModelRegistry.ModelCategory",
				"name": "_category",
				"type": "uint8"
			},
			{
				"internalType": "uint256",
				"name": "_pricePerInference",
				"type": "uint256"
			}
		],
		"name": "registerModel",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "payable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "_marketplaceContract",
				"type": "address"
			}
		],
		"name": "setMarketplaceContract",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "_newOwner",
				"type": "address"
			}
		],
		"name": "transferOwnership",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "_modelId",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "_newPrice",
				"type": "uint256"
			}
		],
		"name": "updatePrice",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "_modelId",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "_amount",
				"type": "uint256"
			}
		],
		"name": "withdrawStake",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	}
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