import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWeb3 } from '../context/Web3Context';
import { ArrowLeft, Send, Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import InferenceProgress from '../components/InferenceProgress';
import toast from 'react-hot-toast';
import { getCategoryName, formatAddress } from '../config/contracts';

function ModelDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getModel, requestInference, isConnected, modelRegistry } = useWeb3();
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
      
      let isAvailable = false;
      try {
        if (modelRegistry) {
          isAvailable = await modelRegistry.isModelAvailable(id);
        }
      } catch (availabilityError) {
        console.warn('Error checking model availability:', availabilityError);
      }
      
      setModel({
        ...modelData,
        isAvailable
      });

      if (!modelData.isActive) {
        toast.error('This model is currently inactive');
      } else if (!isAvailable) {
        toast.error('This model is not available (insufficient stake)');
      }
    } catch (error) {
      console.error('Error loading model:', error);
      toast.error('Failed to load model');
      navigate('/marketplace');
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
        console.log(`Polling request ${requestId}...`);
        const resp = await fetch(`${BACKEND_API.replace(/\/+$/, '')}/requests/${requestId}`);
        console.log('Response status:', resp.status);
        
        if (!resp.ok) {
          const errorText = await resp.text();
          console.error('Error response:', errorText);
          throw new Error(`Failed to fetch request status: ${errorText}`);
        }
        
      const request = await resp.json();
      // Enhanced logging of the full response structure
      console.log('Full response details:', {
        status: request?.status,
        statusText: request?.statusText,
        resultData: request?.resultData,
        result: request?.result,
        output: request?.output,
        prediction: request?.prediction,
        metadata: request?.metadata,
        fullObject: JSON.stringify(request, null, 2)
      });
      
      // Deep clone the request to prevent reference issues
      try {
        request.resultData = request.resultData ? JSON.parse(JSON.stringify(request.resultData)) : undefined;
      } catch (cloneError) {
        console.warn('Failed to clone resultData:', cloneError);
      }
      
      if (!request) throw new Error('Invalid response format');
      
      // Ensure result is properly normalized if present
      if (request.result) {
        request.result = String(request.result).toUpperCase();
        if (request.result === 'HAM') request.result = 'NOT_SPAM';
      }        // Check if request is still processing and update UI accordingly
        const numericStatus = Number(request.status);

        if (
          numericStatus === 1 ||
          numericStatus === 2 ||
          request.statusText === 'COMPUTING' ||
          request.statusText === 'VERIFYING'
        ) {
          console.log('Request still processing...');
          // Update the status but don't extract results yet
          setRequestStatus(request.statusText || (numericStatus === 2 ? 'VERIFYING' : 'COMPUTING'));
          setProgressInfo(request.progress || {
            status: request.statusText || (numericStatus === 2 ? 'VERIFYING' : 'COMPUTING'),
            progress: numericStatus === 2 ? 80 : 50
          });
          return; // Exit early and wait for next poll
        }

        // Debug: log the raw request shape so we can see how resultData is returned
        console.debug('Polled request:', request);

        // If resultData was serialized as a JSON string somewhere upstream,
        // parse it so our extraction logic can work with an object.
        if (request.resultData && typeof request.resultData === 'string') {
          try {
            request.resultData = JSON.parse(request.resultData);
            console.debug('Parsed stringified resultData into object:', request.resultData);
          } catch (e) {
            console.warn('Failed to parse request.resultData JSON string:', e);
          }
        }

                  // Update status and progress with more detailed status tracking
        const newStatus = request.statusText || (numericStatus === 1 ? 'COMPUTING' : (numericStatus === 2 ? 'VERIFYING' : 'PENDING'));
        setRequestStatus(newStatus);
        
        // More granular progress tracking
        if (request.progress) {
          setProgressInfo(request.progress);
        } else {
          // Enhanced progress estimation based on status
          const stageRanges = {
            'PENDING': [0, 10],
            'DOWNLOADING': [10, 30],
            'INITIALIZING': [30, 50],
            'COMPUTING': [40, 70],
            'PROCESSING': [50, 80],
            'SAVING': [80, 95],
            'WAITING_FOR_RESULT': [95, 98], // New stage for waiting for result file
            'COMPLETED': [100, 100],
            'FAILED': [0, 0]
          };
          
          // Get progress range for current status
          const [min, max] = stageRanges[newStatus] || [0, 0];
          
          // Calculate progress within the stage
          const elapsed = Date.now() - (window.requestStartTime || Date.now());
          const stageProgress = Math.min(1, elapsed / 30000); // Assume each stage takes ~30s max
          const progress = min + (stageProgress * (max - min));
          
          setProgressInfo({
            status: newStatus,
            progress: Math.floor(progress)
          });
          
          // Log detailed progress info for debugging
          console.log('Progress update:', {
            status: newStatus,
            progress: Math.floor(progress),
            elapsed: `${(elapsed/1000).toFixed(1)}s`,
            stage: `${min}-${max}%`
          });
        }

        // Completed status (2 = COMPLETED)
        if (numericStatus === 3 || request.statusText === 'COMPLETED') {
          console.log('Request completed, details:', {
            status: request.statusText,
            resultData: request.resultData,
            result: request.result,
            attempts
          });

          // When completed, try to fetch result multiple times
          if (!request.resultData && !request.result && attempts < MAX_ATTEMPTS) {
            setRequestStatus('WAITING_FOR_RESULT');
            setProgressInfo({
              status: 'WAITING_FOR_RESULT',
              progress: 95
            });

            // Create a function to check result file directly
            const checkResultFile = async () => {
              try {
                const resultResp = await fetch(`${BACKEND_API.replace(/\/+$/, '')}/requests/${requestId}`);
                if (resultResp.ok) {
                  const resultData = await resultResp.json();
                  console.log('Result file check:', resultData);
                  
                  if (resultData.resultData || resultData.result) {
                    clearInterval(interval);
                    setPollingInterval(null);
                    setProcessing(false);
                    
                    // Update request object with new data
                    request.resultData = resultData.resultData;
                    request.result = resultData.result;
                    request.confidence = resultData.confidence;
                    return true;
                  }
                }
                return false;
              } catch (err) {
                console.warn('Error checking result file:', err);
                return false;
              }
            };

            // Try to check result file immediately
            const hasResult = await checkResultFile();
            if (hasResult) {
              console.log('Found result file on immediate check');
            } else {
              // If no immediate result, set up rapid polling
              console.log('No immediate result, setting up rapid result checks...');
              clearInterval(interval);
              
              // Check every 500ms for up to 10 seconds
              let checks = 0;
              const maxChecks = 20;
              const newInterval = setInterval(async () => {
                checks++;
                if (checks >= maxChecks) {
                  clearInterval(newInterval);
                  setPollingInterval(null);
                  setProcessing(false);
                  console.log('Gave up waiting for result file after 10 seconds');
                  return;
                }
                
                const found = await checkResultFile();
                if (found) {
                  console.log(`Found result file after ${checks * 500}ms`);
                  clearInterval(newInterval);
                }
              }, 500);
              
              setPollingInterval(newInterval);
              return;
            }
          }
          
          clearInterval(interval);
          setPollingInterval(null);
          setProcessing(false);
          
          // Wait a bit after completion to ensure result is available
          if (attempts === 1) {
            console.log('First completion detection, waiting 2s for result sync...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Fetch the result again after waiting
            const retryResp = await fetch(`${BACKEND_API.replace(/\/+$/, '')}/requests/${requestId}`);
            if (retryResp.ok) {
              const retryRequest = await retryResp.json();
              // Use the retry response if it has more data
              if (retryRequest.resultData || retryRequest.result) {
                console.log('Got result after retry:', retryRequest);
                request.resultData = retryRequest.resultData;
                request.result = retryRequest.result;
                request.confidence = retryRequest.confidence;
              }
            }
          }

          // Initialize result data object, trying multiple possible locations
          let resultData = {};
          
          // First try resultData object
          if (request.resultData) {
            console.log('Found resultData object:', request.resultData);
            if (typeof request.resultData === 'string') {
              try {
                resultData = JSON.parse(request.resultData);
                console.log('Parsed resultData from string:', resultData);
              } catch (e) {
                console.warn('Failed to parse resultData string:', e);
                // If parsing fails, try using it as is
                resultData = { result: request.resultData };
              }
            } else {
              resultData = request.resultData;
            }
          }
          
          // If no resultData, check direct fields
          if (!resultData || Object.keys(resultData).length === 0) {
            console.log('Checking direct result fields');
            if (request.result !== undefined) {
              console.log('Found direct result:', request.result);
              resultData = {
                result: request.result,
                confidence: request.confidence
              };
            }
          }
          
          // Check for nested output structure
          if ((!resultData || Object.keys(resultData).length === 0) && request.output) {
            console.log('Checking output structure:', request.output);
            resultData = {
              result: request.output.label || request.output.result,
              confidence: request.output.confidence
            };
          }

          // Look for result in the exact backend format
          if (!resultData || Object.keys(resultData).length === 0) {
            console.log('Checking for backend result format');
            
            // Check for direct result fields first (main format)
            if (request.result !== undefined && request.confidence !== undefined) {
              console.log('Found standard result format:', {
                result: request.result,
                confidence: request.confidence,
                metadata: request.metadata
              });
              
              resultData = {
                result: request.result,
                confidence: request.confidence,
                metadata: request.metadata
              };
            }
            // Fallback to checking metadata.probabilities
            else if (request.metadata?.probabilities) {
              console.log('Found probabilities in metadata:', request.metadata.probabilities);
              const probs = request.metadata.probabilities;
              const entries = Object.entries(probs);
              if (entries.length > 0) {
                entries.sort((a, b) => b[1] - a[1]); // Sort by probability
                const [topLabel, topProb] = entries[0];
                resultData = {
                  result: topLabel,
                  confidence: topProb,
                  metadata: request.metadata
                };
              }
            }
          }

          console.log('Final extracted resultData:', resultData);

          // Primary result extraction complete, process according to exact format
          // from backend that has {result, confidence, metadata.probabilities}
          const extractFromProbabilities = (probs) => {
            try {
              const entries = Object.entries(probs || {});
              if (entries.length === 0) return null;
              entries.sort((a, b) => b[1] - a[1]);
              return { label: entries[0][0], confidence: entries[0][1] };
            } catch (e) {
              return null;
            }
          };

          let finalLabel = null;
          let finalConfidence = null;

          if (typeof resultData.result !== 'undefined') {
            finalLabel = resultData.result;
            finalConfidence = resultData.confidence ?? null;
          } else if (resultData.output?.label) {
            finalLabel = resultData.output.label;
            finalConfidence = resultData.output.confidence ?? null;
          } else if (resultData.label) {
            finalLabel = resultData.label;
            finalConfidence = resultData.confidence ?? null;
          } else if (typeof resultData.prediction === 'number') {
            // Some models return numeric prediction indices (0/1)
            finalLabel = resultData.prediction === 1 ? 'SPAM' : 'NOT_SPAM';
            finalConfidence = resultData.probabilities?.[String(resultData.prediction)] ?? resultData.confidence ?? null;
          } else {
            const fromProbs = extractFromProbabilities(resultData.metadata?.probabilities || resultData.probabilities);
            if (fromProbs) {
              finalLabel = fromProbs.label;
              finalConfidence = fromProbs.confidence;
            }
          }

          // Normalize label to uppercase common tokens used by UI
          if (finalLabel && typeof finalLabel === 'string') {
            finalLabel = finalLabel.toUpperCase();
            if (finalLabel === 'HAM') finalLabel = 'NOT_SPAM';
          }

          // Debug: show what will be set
          console.debug('Setting result:', { finalLabel, finalConfidence });
          
          // Format confidence for toast display
          const confidenceDisplay = typeof finalConfidence === 'number' 
            ? `${(finalConfidence * 100).toFixed(1)}%`
            : 'N/A';
            
          toast.success(`Result: ${finalLabel || 'UNKNOWN'} | Confidence: ${confidenceDisplay}`, {
            duration: 4000
          });

          setResult({
            requestId,
            result: finalLabel || 'UNKNOWN',
            confidence: finalConfidence || 0,
            metadata: resultData?.metadata || null
          });

          return;
        }

        // Failed - Enhanced error handling
        if (numericStatus === 4 || request.statusText === 'FAILED') {
          clearInterval(interval);
          setPollingInterval(null);
          setProcessing(false);
          setProgressInfo({
            status: 'FAILED',
            progress: 0
          });
          
          // Enhanced error message with more context
          const errorContext = request.failureReason 
            ? `Error: ${request.failureReason}`
            : `Request #${requestId} failed without error details. Status: ${request.statusText || 'FAILED'}`;
          
          console.error('Inference failed:', errorContext);
          toast.error(errorContext, { duration: 5000 });
          return;
        }

        if (numericStatus === 5 || request.statusText === 'REFUNDED') {
          clearInterval(interval);
          setPollingInterval(null);
          setProcessing(false);
          setProgressInfo({
            status: 'REFUNDED',
            progress: 100
          });
          toast('Request refunded due to timeout/failure.');
          return;
        }

        // Timeout handling with more context
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
            <div className="flex items-center gap-2">
              <span className="badge badge-info">
                {getCategoryName(model.category)}
              </span>
              {!model.isActive && (
                <span className="badge badge-error flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" />
                  Inactive
                </span>
              )}
              {!model.isAvailable && model.isActive && (
                <span className="badge badge-warning flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" />
                  Unavailable
                </span>
              )}
            </div>
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
            className={`btn-primary w-full flex items-center justify-center space-x-2 ${
              (!model.isActive || !model.isAvailable) ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            title={
              !model.isActive ? 'Model is inactive' :
              !model.isAvailable ? 'Model is not available (insufficient stake)' :
              'Run inference'
            }
          >
            {processing ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <Send className="h-5 w-5" />
                <span>
                  {!model.isActive ? 'Model Inactive' :
                   !model.isAvailable ? 'Not Available' :
                   `Run Inference (${model.price} MATIC)`}
                </span>
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
            
            <div className="space-y-4">
              <div>
                <div className="text-gray-400 text-sm">Classification</div>
                <div className={`text-2xl font-bold ${
                  result.result === 'SPAM' ? 'text-red-400' : 'text-green-400'
                }`}>
                  {result.result}
                </div>
              </div>
              
              <div>
                <div className="text-gray-400 text-sm mb-1">Confidence</div>
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xl font-semibold">
                      {(result.confidence * 100).toFixed(1)}%
                    </span>
                    <span className={result.result === 'SPAM' ? 'text-red-400' : 'text-green-400'}>
                      {result.result}
                    </span>
                  </div>
                  
                  {result.metadata?.probabilities && (
                    <div className="flex justify-between items-center text-sm">
                      <span>{((1 - result.confidence) * 100).toFixed(1)}%</span>
                      <span className="text-gray-400">
                        {result.result === 'SPAM' ? 'NOT_SPAM' : 'SPAM'}
                      </span>
                    </div>
                  )}
                  
                  {/* Confidence bar */}
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${
                        result.result === 'SPAM' ? 'bg-red-400' : 'bg-green-400'
                      }`}
                      style={{ width: `${result.confidence * 100}%` }}
                    />
                  </div>
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