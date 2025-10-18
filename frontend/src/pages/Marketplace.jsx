import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWeb3 } from '../context/Web3Context';
import { Search, Star, TrendingUp, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { getCategoryName } from '../config/contracts';

function Marketplace() {
  const { isConnected, getActiveModels } = useWeb3();
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (isConnected) {
      loadModels();
    }
  }, [isConnected]);

  async function loadModels() {
    try {
      setLoading(true);
      const activeModels = await getActiveModels();
      setModels(activeModels);
    } catch (error) {
      console.error('Error loading models:', error);
      toast.error('Failed to load models');
    } finally {
      setLoading(false);
    }
  }

  const filteredModels = models.filter(model =>
    model.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    model.description.toLowerCase().includes(searchTerm.toLowerCase())
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
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2">AI Model Marketplace</h1>
          <p className="text-gray-400">
            Browse and use AI models on blockchain
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search models..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-10 w-full md:w-80"
          />
        </div>
      </div>

      {/* Models Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
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
              {/* Model Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-semibold mb-2 group-hover:text-primary-400 transition-colors">
                    {model.name}
                  </h3>
                  <span className="badge badge-info text-xs">
                    {getCategoryName(model.category)}
                  </span>
                </div>
              </div>

              {/* Description */}
              <p className="text-gray-400 text-sm mb-4 line-clamp-2">
                {model.description}
              </p>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                <div>
                  <div className="text-gray-400">Price</div>
                  <div className="font-semibold text-primary-400">
                    {model.price} MATIC
                  </div>
                </div>
                <div>
                  <div className="text-gray-400">Uses</div>
                  <div className="font-semibold">{model.totalInferences}</div>
                </div>
              </div>

              {/* Reputation */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-700">
                <div className="flex items-center space-x-1">
                  <Star className="h-4 w-4 text-yellow-500 fill-current" />
                  <span className="text-sm font-medium">
                    {(parseInt(model.reputation) / 10).toFixed(1)}
                  </span>
                </div>
                <button className="text-primary-500 hover:text-primary-400 text-sm font-medium transition-colors">
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