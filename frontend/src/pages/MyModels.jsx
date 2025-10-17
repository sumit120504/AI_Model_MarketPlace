// frontend/src/pages/MyModels.jsx
import { useState, useEffect } from 'react';
import { useWeb3 } from '../context/Web3Context';
import { Plus, Edit, Power, TrendingUp, DollarSign, Eye } from 'lucide-react';
import { ethers } from 'ethers';

export default function MyModels() {
  const { contracts, account } = useWeb3();
  const [myModels, setMyModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [totalEarnings, setTotalEarnings] = useState('0');

  useEffect(() => {
    if (contracts.modelRegistry && account) {
      fetchMyModels();
    }
  }, [contracts.modelRegistry, account]);

  const fetchMyModels = async () => {
    try {
      setLoading(true);
      const modelCount = await contracts.modelRegistry.modelCounter();
      const modelsArray = [];
      let earnings = ethers.parseEther('0');

      for (let i = 1; i <= Number(modelCount); i++) {
        try {
          const model = await contracts.modelRegistry.models(i);
          
          if (model.creator.toLowerCase() === account.toLowerCase()) {
            // Calculate potential earnings (totalInferences * price * 0.85)
            const modelEarnings = model.pricePerInference * model.totalInferences * BigInt(85) / BigInt(100);
            earnings = earnings + modelEarnings;

            modelsArray.push({
              id: i,
              creator: model.creator,
              ipfsHash: model.ipfsHash,
              modelType: model.modelType,
              pricePerInference: model.pricePerInference,
              reputation: model.reputation,
              totalInferences: model.totalInferences,
              isActive: model.isActive,
              stake: model.stake,
              earnings: modelEarnings
            });
          }
        } catch (error) {
          console.error(`Error fetching model ${i}:`, error);
        }
      }

      setMyModels(modelsArray);
      setTotalEarnings(ethers.formatEther(earnings));
    } catch (error) {
      console.error('Error fetching models:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleModelStatus = async (modelId, currentStatus) => {
    try {
      const tx = currentStatus
        ? await contracts.modelRegistry.deactivateModel(modelId)
        : await contracts.modelRegistry.activateModel(modelId);
      
      await tx.wait();
      fetchMyModels(); // Refresh list
    } catch (error) {
      console.error('Error toggling model status:', error);
      alert('Failed to toggle model status: ' + error.message);
    }
  };

  const updatePrice = async (modelId, newPrice) => {
    try {
      const priceWei = ethers.parseEther(newPrice);
      const tx = await contracts.modelRegistry.updatePrice(modelId, priceWei);
      await tx.wait();
      fetchMyModels();
    } catch (error) {
      console.error('Error updating price:', error);
      alert('Failed to update price: ' + error.message);
    }
  };

  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-12 border border-purple-500/30 text-center max-w-md">
          <h2 className="text-2xl font-bold text-white mb-4">Connect Your Wallet</h2>
          <p className="text-gray-400">
            Please connect your wallet to manage your AI models.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">My Models</h1>
          <p className="text-gray-400">Manage your AI models and track earnings</p>
        </div>
        <button
          onClick={() => setShowRegisterModal(true)}
          className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold px-6 py-3 rounded-lg shadow-lg shadow-purple-500/30 transition-all transform hover:scale-105 flex items-center"
        >
          <Plus className="h-5 w-5 mr-2" />
          Register New Model
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-gradient-to-br from-purple-600/20 to-purple-800/20 rounded-xl p-6 border border-purple-500/30">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <Eye className="h-6 w-6 text-purple-400" />
            </div>
          </div>
          <h3 className="text-gray-400 text-sm font-medium mb-1">Total Models</h3>
          <p className="text-3xl font-bold text-white">{myModels.length}</p>
        </div>

        <div className="bg-gradient-to-br from-pink-600/20 to-pink-800/20 rounded-xl p-6 border border-pink-500/30">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-pink-500/20 rounded-lg flex items-center justify-center">
              <DollarSign className="h-6 w-6 text-pink-400" />
            </div>
          </div>
          <h3 className="text-gray-400 text-sm font-medium mb-1">Total Earnings</h3>
          <p className="text-3xl font-bold text-white">
            {Number(totalEarnings).toFixed(4)} <span className="text-lg text-pink-300">ETH</span>
          </p>
        </div>

        <div className="bg-gradient-to-br from-green-600/20 to-green-800/20 rounded-xl p-6 border border-green-500/30">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-green-400" />
            </div>
          </div>
          <h3 className="text-gray-400 text-sm font-medium mb-1">Total Inferences</h3>
          <p className="text-3xl font-bold text-white">
            {myModels.reduce((sum, model) => sum + Number(model.totalInferences), 0)}
          </p>
        </div>
      </div>

      {/* Models List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-400 mb-4"></div>
          <p className="text-gray-400">Loading your models...</p>
        </div>
      ) : myModels.length === 0 ? (
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-12 border border-purple-500/30 text-center">
          <div className="w-20 h-20 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Plus className="h-10 w-10 text-purple-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-4">No Models Yet</h2>
          <p className="text-gray-400 mb-6">
            Register your first AI model and start earning from the marketplace!
          </p>
          <button
            onClick={() => setShowRegisterModal(true)}
            className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold px-6 py-3 rounded-lg shadow-lg transition-all"
          >
            Register Your First Model
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {myModels.map((model) => (
            <div
              key={model.id}
              className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-6 border border-purple-500/30 hover:border-purple-400/50 transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-bold text-white">
                      Model #{model.id}
                    </h3>
                    {model.isActive ? (
                      <span className="bg-green-500/20 text-green-400 text-xs px-3 py-1 rounded-full border border-green-400/30">
                        Active
                      </span>
                    ) : (
                      <span className="bg-red-500/20 text-red-400 text-xs px-3 py-1 rounded-full border border-red-400/30">
                        Inactive
                      </span>
                    )}
                  </div>
                  <p className="text-gray-400 text-sm">Type: {model.modelType}</p>
                  <p className="text-gray-500 text-xs font-mono mt-1">
                    IPFS: {model.ipfsHash.substring(0, 20)}...
                  </p>
                </div>

                <button
                  onClick={() => toggleModelStatus(model.id, model.isActive)}
                  className={`p-2 rounded-lg border transition-all ${
                    model.isActive
                      ? 'bg-red-500/20 border-red-400/30 text-red-400 hover:bg-red-500/30'
                      : 'bg-green-500/20 border-green-400/30 text-green-400 hover:bg-green-500/30'
                  }`}
                  title={model.isActive ? 'Deactivate' : 'Activate'}
                >
                  <Power className="h-5 w-5" />
                </button>
              </div>

              {/* Model Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-purple-500/10 rounded-lg p-3 border border-purple-500/20">
                  <p className="text-gray-400 text-xs mb-1">Price</p>
                  <p className="text-white font-bold">
                    {ethers.formatEther(model.pricePerInference)} ETH
                  </p>
                </div>

                <div className="bg-pink-500/10 rounded-lg p-3 border border-pink-500/20">
                  <p className="text-gray-400 text-xs mb-1">Inferences</p>
                  <p className="text-white font-bold">{model.totalInferences.toString()}</p>
                </div>

                <div className="bg-green-500/10 rounded-lg p-3 border border-green-500/20">
                  <p className="text-gray-400 text-xs mb-1">Reputation</p>
                  <p className="text-white font-bold">{model.reputation.toString()}</p>
                </div>

                <div className="bg-yellow-500/10 rounded-lg p-3 border border-yellow-500/20">
                  <p className="text-gray-400 text-xs mb-1">Earnings</p>
                  <p className="text-white font-bold">
                    {Number(ethers.formatEther(model.earnings)).toFixed(4)} ETH
                  </p>
                </div>
              </div>

              {/* Stake Info */}
              <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700 mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-sm">Staked Amount</span>
                  <span className="text-purple-300 font-mono">
                    {ethers.formatEther(model.stake)} ETH
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    const newPrice = prompt('Enter new price in ETH:', ethers.formatEther(model.pricePerInference));
                    if (newPrice) updatePrice(model.id, newPrice);
                  }}
                  className="flex-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 font-semibold py-2 rounded-lg border border-purple-400/30 transition-all flex items-center justify-center"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Update Price
                </button>
                
                <a
                  href={`https://ipfs.io/ipfs/${model.ipfsHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 rounded-lg transition-all flex items-center justify-center"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  View on IPFS
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Register Modal */}
      {showRegisterModal && (
        <RegisterModelModal
          onClose={() => setShowRegisterModal(false)}
          onSuccess={() => {
            setShowRegisterModal(false);
            fetchMyModels();
          }}
        />
      )}
    </div>
  );
}

// Register Model Modal Component
function RegisterModelModal({ onClose, onSuccess }) {
  const { contracts } = useWeb3();
  const [formData, setFormData] = useState({
    ipfsHash: '',
    modelType: '',
    price: '',
    stake: '0.01'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    try {
      setLoading(true);

      const priceWei = ethers.parseEther(formData.price);
      const stakeWei = ethers.parseEther(formData.stake);

      const tx = await contracts.modelRegistry.registerModel(
        formData.ipfsHash,
        formData.modelType,
        'Sample AI Model', // metadata
        priceWei,
        { value: stakeWei }
      );

      await tx.wait();
      onSuccess();
      
    } catch (err) {
      console.error('Error registering model:', err);
      setError(err.message || 'Failed to register model');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl max-w-md w-full border border-purple-500/30 shadow-2xl">
        <div className="p-6 border-b border-purple-500/20">
          <h2 className="text-2xl font-bold text-white">Register New Model</h2>
          <p className="text-gray-400 text-sm mt-1">Add your AI model to the marketplace</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* IPFS Hash */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              IPFS Hash *
            </label>
            <input
              type="text"
              required
              value={formData.ipfsHash}
              onChange={(e) => setFormData({ ...formData, ipfsHash: e.target.value })}
              placeholder="bafkreiaeuo..."
              className="w-full bg-gray-900/50 border border-purple-500/30 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-400"
            />
          </div>

          {/* Model Type */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Model Type *
            </label>
            <input
              type="text"
              required
              value={formData.modelType}
              onChange={(e) => setFormData({ ...formData, modelType: e.target.value })}
              placeholder="spam-detector"
              className="w-full bg-gray-900/50 border border-purple-500/30 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-400"
            />
          </div>

          {/* Price */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Price per Inference (ETH) *
            </label>
            <input
              type="number"
              step="0.0001"
              required
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              placeholder="0.001"
              className="w-full bg-gray-900/50 border border-purple-500/30 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-400"
            />
          </div>

          {/* Stake */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Stake Amount (ETH) *
            </label>
            <input
              type="number"
              step="0.001"
              required
              value={formData.stake}
              onChange={(e) => setFormData({ ...formData, stake: e.target.value })}
              placeholder="0.01"
              className="w-full bg-gray-900/50 border border-purple-500/30 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-400"
            />
            <p className="text-xs text-gray-400 mt-1">Minimum: 0.01 ETH</p>
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-400/30 rounded-lg p-3 text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 rounded-lg transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold py-3 rounded-lg transition-all disabled:opacity-50 flex items-center justify-center"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Registering...
                </>
              ) : (
                'Register Model'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}