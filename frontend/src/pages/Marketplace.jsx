// frontend/src/pages/Marketplace.jsx
import { useState, useEffect } from 'react';
import { useWeb3 } from '../context/Web3Context';
import ModelCard from '../components/ModelCard';
import InferenceModal from '../components/InferenceModal';
import { Search, Filter, Loader } from 'lucide-react';

export default function Marketplace() {
  const { contracts, account } = useWeb3();
  const [models, setModels] = useState([]);
  const [filteredModels, setFilteredModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterActive, setFilterActive] = useState('all');
  const [selectedModel, setSelectedModel] = useState(null);
  const [showInferenceModal, setShowInferenceModal] = useState(false);

  // Fetch all models
  useEffect(() => {
    if (contracts.modelRegistry) {
      fetchModels();
    }
  }, [contracts.modelRegistry]);

  // Filter models based on search and filter
  useEffect(() => {
    let filtered = models;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(
        (model) =>
          model.metadata?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          model.modelType?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Active/Inactive filter
    if (filterActive === 'active') {
      filtered = filtered.filter((model) => model.isActive);
    } else if (filterActive === 'inactive') {
      filtered = filtered.filter((model) => !model.isActive);
    }

    setFilteredModels(filtered);
  }, [models, searchTerm, filterActive]);

  const fetchModels = async () => {
    try {
      setLoading(true);
      const modelCount = await contracts.modelRegistry.modelCounter();
      const modelsArray = [];

      for (let i = 1; i <= Number(modelCount); i++) {
        try {
          const model = await contracts.modelRegistry.models(i);
          
          // Parse metadata if it exists
          let metadata = {};
          try {
            if (model.ipfsHash) {
              // In production, fetch from IPFS
              // For demo, use dummy data
              metadata = {
                name: `Model #${i}`,
                description: 'Advanced ML model',
                accuracy: '95%'
              };
            }
          } catch (e) {
            console.error('Error parsing metadata:', e);
          }

          modelsArray.push({
            id: i,
            creator: model.creator,
            ipfsHash: model.ipfsHash,
            modelType: model.modelType,
            pricePerInference: model.pricePerInference,
            reputation: model.reputation,
            totalInferences: model.totalInferences,
            isActive: model.isActive,
            metadata
          });
        } catch (error) {
          console.error(`Error fetching model ${i}:`, error);
        }
      }

      setModels(modelsArray);
    } catch (error) {
      console.error('Error fetching models:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUseModel = (model) => {
    if (!account) {
      alert('Please connect your wallet first!');
      return;
    }
    setSelectedModel(model);
    setShowInferenceModal(true);
  };

  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-12 border border-purple-500/30 text-center max-w-md">
          <div className="w-20 h-20 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Search className="h-10 w-10 text-purple-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-4">Connect Your Wallet</h2>
          <p className="text-gray-400 mb-6">
            Please connect your wallet to browse and use AI models from the marketplace.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent mb-4">
          AI Model Marketplace
        </h1>
        <p className="text-gray-300 text-lg max-w-2xl mx-auto">
          Discover, use, and monetize AI models on the blockchain. Pay-per-use with cryptographic proof of execution.
        </p>
      </div>

      {/* Search and Filter Bar */}
      <div className="bg-gray-800/50 backdrop-blur rounded-xl p-6 mb-8 border border-purple-500/20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Search */}
          <div className="md:col-span-2 relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Search models by name or type..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-gray-900/50 border border-purple-500/30 rounded-lg pl-12 pr-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-400 transition-colors"
            />
          </div>

          {/* Filter */}
          <div className="relative">
            <Filter className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <select
              value={filterActive}
              onChange={(e) => setFilterActive(e.target.value)}
              className="w-full bg-gray-900/50 border border-purple-500/30 rounded-lg pl-12 pr-4 py-3 text-white focus:outline-none focus:border-purple-400 transition-colors appearance-none cursor-pointer"
            >
              <option value="all">All Models</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-purple-500/20">
          <p className="text-gray-400">
            Showing <span className="text-purple-400 font-semibold">{filteredModels.length}</span> models
          </p>
          <button
            onClick={fetchModels}
            className="text-purple-400 hover:text-purple-300 text-sm flex items-center transition-colors"
          >
            <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Models Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader className="h-12 w-12 text-purple-400 animate-spin mb-4" />
          <p className="text-gray-400">Loading models...</p>
        </div>
      ) : filteredModels.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-6">
            <Search className="h-10 w-10 text-gray-600" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">No Models Found</h3>
          <p className="text-gray-400">
            {searchTerm || filterActive !== 'all'
              ? 'Try adjusting your search or filters'
              : 'Be the first to register a model!'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredModels.map((model) => (
            <ModelCard key={model.id} model={model} onUseModel={handleUseModel} />
          ))}
        </div>
      )}

      {/* Inference Modal */}
      {showInferenceModal && selectedModel && (
        <InferenceModal
          model={selectedModel}
          onClose={() => {
            setShowInferenceModal(false);
            setSelectedModel(null);
          }}
        />
      )}
    </div>
  );
}