import { createContext, useContext, useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { CONTRACTS, MODEL_REGISTRY_ABI, INFERENCE_MARKET_ABI, NETWORK } from '../config/contracts';
import toast from 'react-hot-toast';

const Web3Context = createContext();

export function Web3Provider({ children }) {
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [modelRegistry, setModelRegistry] = useState(null);
  const [inferenceMarket, setInferenceMarket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isCorrectNetwork, setIsCorrectNetwork] = useState(false);
  const [balance, setBalance] = useState("0");

  // Initialize provider and check connection
  useEffect(() => {
    checkConnection();
  }, []);

  // Check if wallet is already connected
  async function checkConnection() {
    if (typeof window.ethereum !== 'undefined') {
      try {
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const accounts = await provider.listAccounts();
        
        if (accounts.length > 0) {
          await connectWallet();
        }
      } catch (error) {
        console.error('Error checking connection:', error);
      }
    }
  }

  // Connect wallet
  async function connectWallet() {
    if (typeof window.ethereum === 'undefined') {
      toast.error('Please install MetaMask!');
      return;
    }

    try {
      // Request account access
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      
      const signer = provider.getSigner();
      const address = await signer.getAddress();
      const network = await provider.getNetwork();
      
      // Check if correct network
      const correctNetwork = network.chainId === NETWORK.chainId;
      
      if (!correctNetwork) {
        toast.error(`Please switch to ${NETWORK.name}`);
        await switchNetwork();
        return;
      }

      // Get balance
      const balance = await provider.getBalance(address);
      const balanceInEth = ethers.utils.formatEther(balance);

      // Initialize contracts
      const registryContract = new ethers.Contract(
        CONTRACTS.MODEL_REGISTRY,
        MODEL_REGISTRY_ABI,
        signer
      );

      const marketContract = new ethers.Contract(
        CONTRACTS.INFERENCE_MARKET,
        INFERENCE_MARKET_ABI,
        signer
      );

      // Update state
      setAccount(address);
      setProvider(provider);
      setSigner(signer);
      setModelRegistry(registryContract);
      setInferenceMarket(marketContract);
      setIsConnected(true);
      setIsCorrectNetwork(correctNetwork);
      setBalance(balanceInEth);

      toast.success('Wallet connected!');

    } catch (error) {
      console.error('Error connecting wallet:', error);
      toast.error('Failed to connect wallet');
    }
  }

  // Disconnect wallet
  function disconnectWallet() {
    setAccount(null);
    setProvider(null);
    setSigner(null);
    setModelRegistry(null);
    setInferenceMarket(null);
    setIsConnected(false);
    setIsCorrectNetwork(false);
    setBalance("0");
    toast.success('Wallet disconnected');
  }

  // Switch to correct network
  async function switchNetwork() {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${NETWORK.chainId.toString(16)}` }],
      });
      
      // Reconnect after network switch
      setTimeout(() => connectWallet(), 1000);
      
    } catch (switchError) {
      // Network not added, try to add it
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: `0x${NETWORK.chainId.toString(16)}`,
              chainName: NETWORK.name,
              rpcUrls: [NETWORK.rpcUrl],
              nativeCurrency: NETWORK.nativeCurrency,
              blockExplorerUrls: [NETWORK.blockExplorer]
            }],
          });
          
          setTimeout(() => connectWallet(), 1000);
          
        } catch (addError) {
          console.error('Error adding network:', addError);
          toast.error('Failed to add network');
        }
      } else {
        console.error('Error switching network:', switchError);
        toast.error('Failed to switch network');
      }
    }
  }

  // Listen for account changes
  useEffect(() => {
    if (typeof window.ethereum !== 'undefined') {
      const handleAccountsChanged = (accounts) => {
        if (accounts.length === 0) {
          disconnectWallet();
        } else {
          connectWallet();
        }
      };

      const handleChainChanged = () => {
        window.location.reload();
      };

      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);

      return () => {
        if (typeof window.ethereum !== 'undefined') {
          window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
          window.ethereum.removeListener('chainChanged', handleChainChanged);
        }
      };
    }
  }, []);

  // Refresh balance
  async function refreshBalance() {
    if (provider && account) {
      try {
        const balance = await provider.getBalance(account);
        const balanceInEth = ethers.utils.formatEther(balance);
        setBalance(balanceInEth);
      } catch (error) {
        console.error('Error refreshing balance:', error);
      }
    }
  }

  // Transaction confirmation helper
  async function waitForTransaction(tx, description) {
    try {
      toast.loading(`${description}...`, { id: 'tx-pending' });
      
      const receipt = await tx.wait();
      
      toast.success(`${description} confirmed!`, { 
        id: 'tx-pending',
        duration: 5000
      });
      
      return receipt;
    } catch (error) {
      toast.error(`${description} failed: ${error.message}`, { 
        id: 'tx-pending',
        duration: 5000
      });
      throw error;
    }
  }

  // Contract interaction helpers
  const contractHelpers = {
    // Get all active models
    async getActiveModels() {
      try {
        const modelIds = await modelRegistry.getActiveModels();
        const models = [];
        
        for (const id of modelIds) {
          const model = await modelRegistry.getModel(id);
          models.push({
            id: model.modelId.toString(),
            creator: model.creator,
            ipfsHash: model.ipfsHash,
            name: model.name,
            description: model.description,
            category: model.category,
            price: ethers.utils.formatEther(model.pricePerInference),
            totalInferences: model.totalInferences.toString(),
            reputation: model.reputationScore.toString(),
            isActive: model.isActive
          });
        }
        
        return models;
      } catch (error) {
        console.error('Error getting active models:', error);
        throw error;
      }
    },

    // Get specific model
    async getModel(modelId) {
      try {
        const model = await modelRegistry.getModel(modelId);
        return {
          id: model.modelId.toString(),
          creator: model.creator,
          ipfsHash: model.ipfsHash,
          name: model.name,
          description: model.description,
          category: model.category,
          price: ethers.utils.formatEther(model.pricePerInference),
          stake: ethers.utils.formatEther(model.creatorStake),
          totalInferences: model.totalInferences.toString(),
          totalEarnings: ethers.utils.formatEther(model.totalEarnings),
          reputation: model.reputationScore.toString(),
          createdAt: new Date(model.createdAt.toNumber() * 1000),
          isActive: model.isActive
        };
      } catch (error) {
        console.error('Error getting model:', error);
        throw error;
      }
    },

    // Get user's models (if creator)
    async getCreatorModels(address) {
      try {
        const modelIds = await modelRegistry.getCreatorModels(address);
        const models = [];
        
        for (const id of modelIds) {
          const model = await contractHelpers.getModel(id.toString());
          models.push(model);
        }
        
        return models;
      } catch (error) {
        console.error('Error getting creator models:', error);
        throw error;
      }
    },

    // Register new model
    async registerModel(ipfsHash, name, description, category, price, stake) {
      try {
        const priceInWei = ethers.utils.parseEther(price.toString());
        const stakeInWei = ethers.utils.parseEther(stake.toString());
        
        const tx = await modelRegistry.registerModel(
          ipfsHash,
          name,
          description,
          category,
          priceInWei,
          { value: stakeInWei }
        );
        
        const receipt = await waitForTransaction(tx, 'Registering model');
        
        // Get model ID from event
        const event = receipt.events.find(e => e.event === 'ModelRegistered');
        const modelId = event.args.modelId.toString();
        
        toast.success(`Model registered! ID: ${modelId}`);
        await refreshBalance();
        
        return modelId;
      } catch (error) {
        console.error('Error registering model:', error);
        toast.error('Failed to register model', { id: 'register' });
        throw error;
      }
    },

    // Request inference
    async requestInference(modelId, inputText) {
      try {
        // Get model price
        const model = await contractHelpers.getModel(modelId);
        const priceInWei = ethers.utils.parseEther(model.price);
        
        // Generate input hash
        const inputHash = ethers.utils.keccak256(
          ethers.utils.toUtf8Bytes(inputText)
        );
        
        const tx = await inferenceMarket.requestInference(
          modelId,
          inputHash,
          { value: priceInWei }
        );
        
        const receipt = await waitForTransaction(tx, 'Creating inference request');
        
        // Get request ID from event
        const event = receipt.events.find(e => e.event === 'InferenceRequested');
        const requestId = event.args.requestId.toString();
        
        toast.success(`Request created! ID: ${requestId}`);
        await refreshBalance();
        
        return requestId;
      } catch (error) {
        console.error('Error requesting inference:', error);
        toast.error('Failed to create request', { id: 'inference' });
        throw error;
      }
    },

    // Get user's inference requests
    async getUserRequests(address) {
      try {
        const requestIds = await inferenceMarket.getUserRequests(address);
        const requests = [];
        
        for (const id of requestIds) {
          const request = await inferenceMarket.getRequest(id);
          requests.push({
            id: request.requestId.toString(),
            modelId: request.modelId.toString(),
            user: request.user,
            payment: ethers.utils.formatEther(request.payment),
            inputDataHash: request.inputDataHash,
            resultHash: request.resultHash,
            computeNode: request.computeNode,
            createdAt: new Date(request.createdAt.toNumber() * 1000),
            completedAt: request.completedAt.toNumber() > 0 
              ? new Date(request.completedAt.toNumber() * 1000) 
              : null,
            status: request.status
          });
        }
        
        return requests.reverse(); // Most recent first
      } catch (error) {
        console.error('Error getting user requests:', error);
        throw error;
      }
    },

    // Get specific request
    async getRequest(requestId) {
      try {
        const request = await inferenceMarket.getRequest(requestId);
        return {
          id: request.requestId.toString(),
          modelId: request.modelId.toString(),
          user: request.user,
          payment: ethers.utils.formatEther(request.payment),
          inputDataHash: request.inputDataHash,
          resultHash: request.resultHash,
          computeNode: request.computeNode,
          createdAt: new Date(request.createdAt.toNumber() * 1000),
          completedAt: request.completedAt.toNumber() > 0 
            ? new Date(request.completedAt.toNumber() * 1000) 
            : null,
          status: request.status
        };
      } catch (error) {
        console.error('Error getting request:', error);
        throw error;
      }
    },

    // Update model price
    async updateModelPrice(modelId, newPrice) {
      try {
        const priceInWei = ethers.utils.parseEther(newPrice.toString());
        const tx = await modelRegistry.updatePrice(modelId, priceInWei);
        
        await waitForTransaction(tx, 'Updating price');
      } catch (error) {
        console.error('Error updating price:', error);
        toast.error('Failed to update price', { id: 'update-price' });
        throw error;
      }
    },

    // Deactivate model
    async deactivateModel(modelId) {
      try {
        const tx = await modelRegistry.deactivateModel(modelId);
        
        await waitForTransaction(tx, 'Deactivating model');
      } catch (error) {
        console.error('Error deactivating model:', error);
        toast.error('Failed to deactivate', { id: 'deactivate' });
        throw error;
      }
    },

    // Activate model
    async activateModel(modelId) {
      try {
        const tx = await modelRegistry.activateModel(modelId);
        
        await waitForTransaction(tx, 'Activating model');
      } catch (error) {
        console.error('Error activating model:', error);
        toast.error('Failed to activate', { id: 'activate' });
        throw error;
      }
    }
  };

  const value = {
    account,
    provider,
    signer,
    modelRegistry,
    inferenceMarket,
    isConnected,
    isCorrectNetwork,
    balance,
    connectWallet,
    disconnectWallet,
    switchNetwork,
    refreshBalance,
    ...contractHelpers
  };

  return (
    <Web3Context.Provider value={value}>
      {children}
    </Web3Context.Provider>
  );
}

export function useWeb3() {
  const context = useContext(Web3Context);
  if (!context) {
    throw new Error('useWeb3 must be used within Web3Provider');
  }
  return context;
}