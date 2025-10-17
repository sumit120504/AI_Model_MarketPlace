// frontend/src/components/InferenceModal.jsx
import { useState } from 'react';
import { useWeb3 } from '../context/Web3Context';
import { X, Zap, Loader, CheckCircle, AlertCircle, Send } from 'lucide-react';
import { ethers } from 'ethers';

export default function InferenceModal({ model, onClose }) {
  const { contracts, account } = useWeb3();
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [txHash, setTxHash] = useState(null);
  const [requestId, setRequestId] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!inputText.trim()) {
      setError('Please enter some text to analyze');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setResult(null);
      setTxHash(null);

      // Call smart contract to create inference request
      const tx = await contracts.inferenceMarket.requestInference(
        model.id,
        ethers.encodeBytes32String(inputText.substring(0, 31)), // Simple encoding for demo
        {
          value: model.pricePerInference
        }
      );

      setTxHash(tx.hash);
      
      // Wait for transaction confirmation
      const receipt = await tx.wait();
      
      // Get request ID from event
      const event = receipt.logs.find(
        log => log.topics[0] === ethers.id('InferenceRequested(uint256,address,uint256)')
      );
      
      if (event) {
        const decodedRequestId = ethers.toBigInt(event.topics[1]);
        setRequestId(decodedRequestId.toString());
        
        // In production, listen for InferenceCompleted event
        // For demo, simulate result after delay
        setTimeout(() => {
          setResult({
            isSpam: Math.random() > 0.5,
            confidence: (Math.random() * 0.3 + 0.7).toFixed(2),
            message: 'Analysis completed successfully'
          });
          setLoading(false);
        }, 5000);
      }

    } catch (err) {
      console.error('Error:', err);
      setError(err.message || 'Transaction failed');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl max-w-2xl w-full border border-purple-500/30 shadow-2xl shadow-purple-500/20">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-purple-500/20">
          <div className="flex items-center">
            <Zap className="h-6 w-6 text-purple-400 mr-3" />
            <div>
              <h2 className="text-2xl font-bold text-white">
                {model.metadata?.name || 'AI Model'}
              </h2>
              <p className="text-sm text-gray-400">
                {ethers.formatEther(model.pricePerInference)} ETH per inference
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {/* Input Form */}
          {!result && !loading && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Enter Text to Analyze (Spam Detection)
                </label>
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Example: Congratulations! You've won $1000000! Click here to claim..."
                  className="w-full bg-gray-900/50 border border-purple-500/30 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-400 transition-colors min-h-[120px] resize-none"
                />
              </div>

              {error && (
                <div className="bg-red-500/20 border border-red-400/30 rounded-lg p-4 flex items-start">
                  <AlertCircle className="h-5 w-5 text-red-400 mr-3 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-red-300 font-medium">Error</p>
                    <p className="text-red-200 text-sm mt-1">{error}</p>
                  </div>
                </div>
              )}

              <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-300 text-sm">Cost</span>
                  <span className="text-white font-bold">
                    {ethers.formatEther(model.pricePerInference)} ETH
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-300 text-sm">Your Balance</span>
                  <span className="text-purple-300 text-sm">Connected</span>
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold py-3 rounded-lg shadow-lg shadow-purple-500/30 transition-all transform hover:scale-105 flex items-center justify-center"
              >
                <Send className="h-5 w-5 mr-2" />
                Run Inference
              </button>
            </form>
          )}

          {/* Loading State */}
          {loading && (
            <div className="text-center py-8">
              <Loader className="h-12 w-12 text-purple-400 animate-spin mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">Processing...</h3>
              <p className="text-gray-400 mb-4">
                Your inference request is being processed on the blockchain
              </p>
              
              {txHash && (
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4 inline-block">
                  <p className="text-sm text-gray-400 mb-1">Transaction Hash</p>
                  <a
                    href={`https://mumbai.polygonscan.com/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-300 text-sm font-mono hover:text-purple-200 transition-colors"
                  >
                    {txHash.substring(0, 10)}...{txHash.substring(txHash.length - 8)}
                  </a>
                </div>
              )}

              {requestId && (
                <div className="mt-4 bg-pink-500/10 border border-pink-500/30 rounded-lg p-4 inline-block">
                  <p className="text-sm text-gray-400 mb-1">Request ID</p>
                  <p className="text-pink-300 text-lg font-bold">#{requestId}</p>
                </div>
              )}

              <div className="mt-6 space-y-2 text-left max-w-md mx-auto">
                <div className="flex items-center text-sm text-gray-400">
                  <div className="w-2 h-2 bg-green-400 rounded-full mr-3 animate-pulse"></div>
                  Payment locked in escrow
                </div>
                <div className="flex items-center text-sm text-gray-400">
                  <div className="w-2 h-2 bg-yellow-400 rounded-full mr-3 animate-pulse"></div>
                  Compute node processing request
                </div>
                <div className="flex items-center text-sm text-gray-400">
                  <div className="w-2 h-2 bg-purple-400 rounded-full mr-3 animate-pulse"></div>
                  Generating cryptographic proof
                </div>
              </div>
            </div>
          )}

          {/* Result Display */}
          {result && (
            <div className="space-y-4">
              <div className="bg-green-500/20 border border-green-400/30 rounded-lg p-6 flex items-start">
                <CheckCircle className="h-6 w-6 text-green-400 mr-4 mt-1 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-white mb-2">Analysis Complete!</h3>
                  <p className="text-gray-300">{result.message}</p>
                </div>
              </div>

              {/* Spam Detection Result */}
              <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-purple-500/30 rounded-lg p-6">
                <h4 className="text-lg font-semibold text-white mb-4">Result</h4>
                
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-purple-500/10 rounded-lg p-4 border border-purple-500/20">
                    <p className="text-gray-400 text-sm mb-1">Classification</p>
                    <p className={`text-2xl font-bold ${result.isSpam ? 'text-red-400' : 'text-green-400'}`}>
                      {result.isSpam ? 'SPAM' : 'NOT SPAM'}
                    </p>
                  </div>
                  
                  <div className="bg-pink-500/10 rounded-lg p-4 border border-pink-500/20">
                    <p className="text-gray-400 text-sm mb-1">Confidence</p>
                    <p className="text-2xl font-bold text-white">
                      {(result.confidence * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>

                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                  <p className="text-gray-400 text-sm mb-2">Input Text</p>
                  <p className="text-white text-sm">{inputText}</p>
                </div>
              </div>

              {/* Transaction Details */}
              {txHash && (
                <div className="bg-gray-900/50 border border-purple-500/20 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-300 mb-3">Transaction Details</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Request ID</span>
                      <span className="text-purple-300 font-mono">#{requestId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Cost</span>
                      <span className="text-white">{ethers.formatEther(model.pricePerInference)} ETH</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Transaction</span>
                      <a
                        href={`https://mumbai.polygonscan.com/tx/${txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-purple-300 hover:text-purple-200 transition-colors flex items-center"
                      >
                        View on Explorer
                        <svg className="h-3 w-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setResult(null);
                    setInputText('');
                    setTxHash(null);
                    setRequestId(null);
                  }}
                  className="flex-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 font-semibold py-3 rounded-lg border border-purple-400/30 transition-all"
                >
                  Run Another
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 rounded-lg transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}