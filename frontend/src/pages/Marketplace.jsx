import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWeb3 } from '../context/Web3Context';
import { Search, Star, Sparkles, Loader2 } from 'lucide-react';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import { getCategoryName } from '../config/contracts';

function normalizeModel(model) {
  return {
    id: model.modelId.toString(),
    creator: model.creator,
    ipfsHash: model.ipfsHash,
    name: model.name,
    description: model.description,
    category: model.category,
    price: ethers.utils.formatEther(model.pricePerInference),
    totalInferences: model.totalInferences.toString(),
    reputation: model.reputationScore.toString(),
    isActive: model.isActive,
  };
}

function Marketplace() {
  const { 
    isConnected, 
    getActiveModels, 
    isAdmin, 
    modelRegistry,
    isCorrectNetwork 
  } = useWeb3();
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    if (isConnected && isCorrectNetwork && modelRegistry) {
      loadModels();
    } else if (isConnected && !isCorrectNetwork) {
      setError('Please switch to the correct network');
      setLoading(false);
    } else if (!isConnected) {
      setError('Please connect your wallet');
      setLoading(false);
    } else if (!modelRegistry) {
      setError('Contract not initialized. Please check your connection and try again.');
      setLoading(false);
    }
  }, [isConnected, isCorrectNetwork, modelRegistry, isAdmin, showInactive]);

  async function loadModels() {
    try {
      setLoading(true);

      let loadedModels = [];
      if (isAdmin && showInactive) {
        const totalModels = await modelRegistry.getTotalModels();
        const total = Number(totalModels.toString());

        const allModels = await Promise.all(
          Array.from({ length: total }, (_, index) => modelRegistry.getModel(index + 1))
        );
        loadedModels = allModels.map(normalizeModel);
      } else {
        loadedModels = await getActiveModels();
      }

      setModels(loadedModels);
    } catch (error) {
      console.error('Error loading models:', error);
      setError(error?.reason || error?.message || 'Failed to load models');
      toast.error('Failed to load models');
    } finally {
      setLoading(false);
    }
  }

  const filteredModels = models
    .filter(model => 
      (showInactive || model.isActive) &&
      (model.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
       model.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold mb-4">Connect Your Wallet</h2>
        <p className="text-gray-400">
          Please connect your wallet to browse AI models
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="card">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs uppercase tracking-wide text-cyan-100 mb-3">
              <Sparkles className="h-3.5 w-3.5" />
              On-chain Model Discovery
            </div>
            <h1 className="text-3xl md:text-4xl font-bold mb-2">Nexus - Decentralized AI Models Marketplace</h1>
            <p className="text-slate-300">
              Discover creator-owned models for text and image intelligence workflows.
            </p>
          </div>

          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search models by name or description"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input pl-10 w-full"
            />
          </div>
        </div>

        {isAdmin && (
          <label className="mt-4 inline-flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Show Inactive Models
          </label>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card py-5">
          <p className="text-xs text-slate-400">Total Visible Models</p>
          <p className="text-2xl font-bold mt-1">{filteredModels.length}</p>
        </div>
        <div className="card py-5">
          <p className="text-xs text-slate-400">Active Models</p>
          <p className="text-2xl font-bold mt-1">{models.filter((m) => m.isActive).length}</p>
        </div>
        <div className="card py-5">
          <p className="text-xs text-slate-400">Avg Reputation</p>
          <p className="text-2xl font-bold mt-1">
            {models.length ? (models.reduce((acc, m) => acc + Number(m.reputation || 0), 0) / models.length / 10).toFixed(1) : '0.0'}
          </p>
        </div>
        <div className="card py-5">
          <p className="text-xs text-slate-400">Total Uses</p>
          <p className="text-2xl font-bold mt-1">{models.reduce((acc, m) => acc + Number(m.totalInferences || 0), 0)}</p>
        </div>
      </div>

      {/* Models Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
        </div>
      ) : error ? (
        <div className="text-center py-20">
          <p className="text-red-400 text-lg">{error}</p>
        </div>
      ) : filteredModels.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-400 text-lg">
            {searchTerm ? 'No models found matching your search' : 'No active models yet'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredModels.map((model) => (
            <Link
              key={model.id}
              to={`/model/${model.id}`}
              className="card card-hover group"
            >
              <div
                className="hero-image-card mb-4"
                style={{
                  backgroundImage: `url(${Number(model.category) === 1
                    ? 'https://images.unsplash.com/photo-1677442135136-760c813a743d?auto=format&fit=crop&w=1200&q=80'
                    : 'https://images.unsplash.com/photo-1674027444485-cec3da58eef4?auto=format&fit=crop&w=1200&q=80'})`
                }}
              />

              {/* Model Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-semibold mb-2 group-hover:text-cyan-200 transition-colors">
                    {model.name}
                  </h3>
                  <span className="badge badge-info text-xs">
                    {getCategoryName(model.category)}
                  </span>
                </div>
              </div>

              {/* Description */}
              <p className="text-slate-300 text-sm mb-4 line-clamp-2">
                {model.description}
              </p>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                <div>
                  <div className="text-slate-400">Price</div>
                  <div className="font-semibold text-cyan-300">
                    {model.price} MATIC
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Uses</div>
                  <div className="font-semibold">{model.totalInferences}</div>
                </div>
              </div>

              {/* Reputation */}
              <div className="flex items-center justify-between pt-4 border-t border-white/10">
                <div className="flex items-center space-x-1">
                  <Star className="h-4 w-4 text-yellow-500 fill-current" />
                  <span className="text-sm font-medium">
                    {(parseInt(model.reputation) / 10).toFixed(1)}
                  </span>
                </div>
                <button className="text-cyan-300 hover:text-cyan-200 text-sm font-medium transition-colors">
                  Use Model →
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default Marketplace;