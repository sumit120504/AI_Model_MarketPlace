// frontend/src/components/ModelCard.jsx
import { Star, TrendingUp, Zap, ExternalLink } from 'lucide-react';
import { ethers } from 'ethers';

export default function ModelCard({ model, onUseModel }) {
  const formatPrice = (priceWei) => {
    try {
      return ethers.formatEther(priceWei);
    } catch {
      return '0';
    }
  };

  const formatAddress = (address) => {
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  // Calculate rating based on reputation (simple scale)
  const calculateRating = (reputation) => {
    const rating = Math.min(5, Math.floor(Number(reputation) / 20));
    return rating;
  };

  const rating = calculateRating(model.reputation);

  return (
    <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-6 border border-purple-500/30 hover:border-purple-400/50 transition-all hover:shadow-xl hover:shadow-purple-500/20 transform hover:-translate-y-1">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-xl font-bold text-white mb-2">{model.metadata?.name || 'Unnamed Model'}</h3>
          <p className="text-gray-400 text-sm line-clamp-2">
            {model.metadata?.description || 'No description available'}
          </p>
        </div>
        
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

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-purple-500/10 rounded-lg p-3 border border-purple-500/20">
          <div className="flex items-center text-purple-300 text-sm mb-1">
            <TrendingUp className="h-4 w-4 mr-2" />
            <span>Inferences</span>
          </div>
          <p className="text-2xl font-bold text-white">{model.totalInferences?.toString() || '0'}</p>
        </div>

        <div className="bg-pink-500/10 rounded-lg p-3 border border-pink-500/20">
          <div className="flex items-center text-pink-300 text-sm mb-1">
            <Star className="h-4 w-4 mr-2" />
            <span>Reputation</span>
          </div>
          <p className="text-2xl font-bold text-white">{model.reputation?.toString() || '0'}</p>
        </div>
      </div>

      {/* Rating */}
      <div className="flex items-center mb-4">
        {[...Array(5)].map((_, i) => (
          <Star
            key={i}
            className={`h-5 w-5 ${
              i < rating
                ? 'text-yellow-400 fill-yellow-400'
                : 'text-gray-600'
            }`}
          />
        ))}
        <span className="ml-2 text-gray-400 text-sm">
          ({model.totalInferences?.toString() || '0'} uses)
        </span>
      </div>

      {/* Additional Info */}
      <div className="space-y-2 mb-4">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Model Type:</span>
          <span className="text-purple-300 font-medium">{model.modelType || 'Unknown'}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Creator:</span>
          <span className="text-purple-300 font-mono text-xs">{formatAddress(model.creator)}</span>
        </div>
        {model.metadata?.accuracy && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Accuracy:</span>
            <span className="text-green-400 font-medium">{model.metadata.accuracy}</span>
          </div>
        )}
      </div>

      {/* Price */}
      <div className="bg-gradient-to-r from-purple-600/20 to-pink-600/20 rounded-lg p-4 mb-4 border border-purple-400/30">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-sm">Price per inference</p>
            <p className="text-3xl font-bold text-white">
              {formatPrice(model.pricePerInference)} <span className="text-lg text-purple-300">ETH</span>
            </p>
          </div>
          <Zap className="h-8 w-8 text-purple-400" />
        </div>
      </div>

      {/* IPFS Link */}
      {model.ipfsHash && (
        <a
          href={`https://ipfs.io/ipfs/${model.ipfsHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center text-sm text-gray-400 hover:text-purple-400 mb-4 transition-colors"
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          View on IPFS
        </a>
      )}

      {/* Action Button */}
      {model.isActive && (
        <button
          onClick={() => onUseModel(model)}
          className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold py-3 rounded-lg shadow-lg shadow-purple-500/30 transition-all transform hover:scale-105 flex items-center justify-center"
        >
          <Zap className="h-5 w-5 mr-2" />
          Use This Model
        </button>
      )}
    </div>
  );
}