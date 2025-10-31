import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWeb3 } from '../context/Web3Context';
import { ArrowLeft, Send, Loader2, CheckCircle, XCircle } from 'lucide-react';
import InferenceProgress from '../components/InferenceProgress';
import toast from 'react-hot-toast';
import { getCategoryName, formatAddress } from '../config/contracts';

function ModelDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getModel, requestInference, isConnected } = useWeb3();
  const BACKEND_API = process.env.REACT_APP_BACKEND_API_URL || import.meta.env.VITE_BACKEND_API_URL;
  
  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState('');
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [pollingInterval, setPollingInterval] = useState(null);
  const [requestStatus, setRequestStatus] = useState(null);
  const [startTime, setStartTime] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [progressInfo, setProgressInfo] = useState(null);

  useEffect(() => {
    if (isConnected && id) {
      loadModel();
    }
  }, [isConnected, id]);

  // Update elapsed time while processing
  useEffect(() => {
    let timer;
    if (processing && startTime) {
      timer = setInterval(() => {
        setElapsedTime(Date.now() - startTime);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [processing, startTime]);

  async function loadModel() {
    try {
      setLoading(true);
      const modelData = await getModel(id);
      setModel(modelData);
    } catch (error) {
      console.error('Error loading model:', error);
      toast.error('Failed to load model');
    } finally {
      setLoading(false);
    }
  }

   async function handleInference() {
    if (!inputText.trim()) {
      toast.error('Please enter some text');
      return;
    }

    try {
      setProcessing(true);
      setResult(null);
      setRequestStatus('PENDING');
      setStartTime(Date.now());
      setElapsedTime(0);
      setProgressInfo({
        status: 'PENDING',
        progress: 0
      });
      
      const requestId = await requestInference(id, inputText);
      
      toast.success('Inference request created! Processing...', {
        duration: 5000
      });
      
      // Start polling for result
      startPolling(requestId);    
    } catch (error) {
      console.error('Error requesting inference:', error);
      toast.error(`Failed to request inference: ${error.message}`);
      setProcessing(false);
      setProgressInfo(null);
    }
  }

   async function startPolling(requestId) {
    const MAX_ATTEMPTS = 30; // 30 x 2 seconds = 1 minute max
    let attempts = 0;
    const interval = setInterval(async () => {
      try {
        attempts++;

        // Prefer backend API which can return the result payload saved by compute node
        const resp = await fetch(`${BACKEND_API.replace(/\/+$/, '')}/requests/${requestId}`);
        if (!resp.ok) {
          const errorText = await resp.text();
          throw new Error(`Failed to fetch request status: ${errorText}`);
        }
        const request = await resp.json();
        if (!request) throw new Error('Invalid response format');        // Update status and progress
        setRequestStatus(request.statusText || 'PENDING');
        if (request.progress) {
          setProgressInfo(request.progress);
        } else {
          // Estimate progress based on status
          const stageRanges = {
            'PENDING': [0, 10],
            'DOWNLOADING': [10, 30],
            'INITIALIZING': [30, 50],
            'PROCESSING': [50, 80],
            'SAVING': [80, 95],
            'COMPLETED': [100, 100],
            'FAILED': [0, 0]
          };
          const [min, max] = stageRanges[request.statusText] || [0, 0];
          setProgressInfo({
            status: request.statusText,
            progress: Math.floor(min + (Math.random() * (max - min)))
          });
        }

        // Completed status (2 = COMPLETED)
        if (request.status === '2' || request.status === 2 || request.statusText === 'COMPLETED') {
          clearInterval(interval);
          setPollingInterval(null);
          setProcessing(false);

          const resultData = request.resultData || {};
          setResult({
            requestId,
            result: resultData.result || (resultData.output?.label || 'UNKNOWN'),
            confidence: resultData.confidence || (resultData.output?.confidence || 0)
          });

          toast.success('Inference completed!');
          return;
        }

        // Failed
        if (request.status === '3' || request.statusText === 'FAILED') {
          clearInterval(interval);
          setPollingInterval(null);
          setProcessing(false);
          setProgressInfo({
            status: 'FAILED',
            progress: 0
          });
          toast.error('Inference failed: ' + (request.failureReason || 'Unknown error'));
          return;
        }

        if (attempts >= MAX_ATTEMPTS) {
          clearInterval(interval);
          setPollingInterval(null);
          setProcessing(false);
          setProgressInfo({
            status: 'FAILED',
            progress: 0
          });
          toast.error('Request timed out. Please try again.');
          return;
        }
      } catch (error) {
        console.error('Error polling for result:', error);
        if (attempts < MAX_ATTEMPTS) {
          // Continue polling on temporary errors
          console.log(`Retrying... Attempt ${attempts}/${MAX_ATTEMPTS}`);
          return;
        }
        // Stop on max attempts
        clearInterval(interval);
        setPollingInterval(null);
        setProcessing(false);
        setProgressInfo({
          status: 'FAILED',
          progress: 0
        });
        toast.error(`Failed to get result: ${error.message}`);
      }
    }, 2000);
    
    setPollingInterval(interval);
    window.requestStartTime = Date.now();
  }

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold mb-4">Connect Your Wallet</h2>
        <p className="text-gray-400">
          Please connect your wallet to use AI models
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (!model) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-400">Model not found</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back Button */}
      <button
        onClick={() => navigate('/marketplace')}
        className="flex items-center space-x-2 text-gray-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="h-5 w-5" />
        <span>Back to Marketplace</span>
      </button>

      {/* Model Header */}
      <div className="card">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">{model.name}</h1>
            <span className="badge badge-info">
              {getCategoryName(model.category)}
            </span>
          </div>
          <div className="text-right">
            <div className="text-gray-400 text-sm">Price per use</div>
            <div className="text-2xl font-bold text-primary-400">
              {model.price} MATIC
            </div>
          </div>
        </div>

        <p className="text-gray-300 mb-6">{model.description}</p>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-900 rounded-lg">
          <div>
            <div className="text-gray-400 text-sm">Total Uses</div>
            <div className="text-xl font-semibold">{model.totalInferences}</div>
          </div>
          <div>
            <div className="text-gray-400 text-sm">Reputation</div>
            <div className="text-xl font-semibold">
              {(parseInt(model.reputation) / 10).toFixed(1)}/100
            </div>
          </div>
          <div>
            <div className="text-gray-400 text-sm">Creator</div>
            <div className="text-xl font-semibold text-primary-400">
              {formatAddress(model.creator)}
            </div>
          </div>
          <div>
            <div className="text-gray-400 text-sm">Total Earnings</div>
            <div className="text-xl font-semibold">
              {parseFloat(model.totalEarnings).toFixed(4)} MATIC
            </div>
          </div>
        </div>
      </div>

      {/* Inference Interface */}
      <div className="card">
        <h2 className="text-2xl font-bold mb-4">Try This Model</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Input Text (Email to check for spam)
            </label>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Enter email text here..."
              className="input min-h-[120px] resize-none"
              disabled={processing}
            />
          </div>

          <button
            onClick={handleInference}
            disabled={processing || !inputText.trim()}
            className="btn-primary w-full flex items-center justify-center space-x-2"
          >
            {processing ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <Send className="h-5 w-5" />
                <span>Run Inference ({model.price} MATIC)</span>
              </>
            )}
          </button>
        </div>

        {/* Progress Indicator */}
        {processing && (
          <div className="mt-4">
            <InferenceProgress 
              status={requestStatus}
              progress={progressInfo?.progress || 0}
              startTime={startTime}
            />
          </div>
        )}

        {/* Result Display */}
        {result && (
          <div className="mt-6 p-6 bg-gray-900 rounded-lg border-2 border-primary-500 animate-fadeIn">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold">Result</h3>
              {result.result === 'SPAM' ? (
                <XCircle className="h-6 w-6 text-red-500" />
              ) : (
                <CheckCircle className="h-6 w-6 text-green-500" />
              )}
            </div>
            
            <div className="space-y-3">
              <div>
                <div className="text-gray-400 text-sm">Classification</div>
                <div className={`text-2xl font-bold ${
                  result.result === 'SPAM' ? 'text-red-400' : 'text-green-400'
                }`}>
                  {result.result}
                </div>
              </div>
              
              <div>
                <div className="text-gray-400 text-sm">Confidence</div>
                <div className="text-xl font-semibold">
                  {(result.confidence * 100).toFixed(1)}%
                </div>
              </div>
              
              <div>
                <div className="text-gray-400 text-sm">Request ID</div>
                <div className="text-sm font-mono text-primary-400">
                  #{result.requestId}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sample Inputs */}
      <div className="card">
        <h3 className="text-lg font-bold mb-4">Sample Inputs to Try</h3>
        <div className="space-y-2">
          {[
            "Hi John, let's meet for coffee tomorrow at 3pm",
            "CONGRATULATIONS! You've WON $1,000,000! Click here NOW!",
            "Meeting reminder: Q4 planning session on Monday"
          ].map((sample, index) => (
            <button
              key={index}
              onClick={() => setInputText(sample)}
              className="w-full text-left p-3 bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors text-sm"
            >
              {sample}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ModelDetails;