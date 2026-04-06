import { useState } from 'react';
import { useWeb3 } from '../context/Web3Context';
import { Loader2, ShieldCheck, Settings, Cpu, Scale } from 'lucide-react';
import toast from 'react-hot-toast';

function AdminPanel() {
  const {
    isConnected,
    isAdmin,
    authorizeComputeNode,
    revokeComputeNode,
    setTokenRate,
    setEvaluationWeights,
    setEvaluationScore
  } = useWeb3();

  const [nodeAddress, setNodeAddress] = useState('');
  const [modelId, setModelId] = useState('');
  const [score, setScore] = useState('500');
  const [tokenRate, setTokenRateValue] = useState('1');
  const [weights, setWeights] = useState({
    accuracy: '25',
    efficiency: '25',
    reliability: '25',
    responseTime: '25'
  });
  const [loading, setLoading] = useState(false);

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold mb-4">Connect Your Wallet</h2>
        <p className="text-gray-400">Please connect the owner wallet to access admin controls.</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold mb-4">Admin Access Required</h2>
        <p className="text-gray-400">Only the contract owner can access this panel.</p>
      </div>
    );
  }

  const withLoading = async (fn) => {
    try {
      setLoading(true);
      await fn();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="card">
        <h1 className="text-3xl md:text-4xl font-bold mb-2">Admin Panel</h1>
        <p className="text-slate-300">Owner controls for node authorization and economic parameters.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary-500" />
            <h2 className="text-xl font-semibold">Compute Node Management</h2>
          </div>

          <input
            value={nodeAddress}
            onChange={(e) => setNodeAddress(e.target.value)}
            placeholder="0x... node address"
            className="input-field"
          />

          <div className="flex gap-3">
            <button
              className="btn-primary"
              disabled={loading || !nodeAddress}
              onClick={() => withLoading(async () => {
                await authorizeComputeNode(nodeAddress);
                toast.success('Node authorized');
              })}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Authorize'}
            </button>
            <button
              className="btn-secondary"
              disabled={loading || !nodeAddress}
              onClick={() => withLoading(async () => {
                await revokeComputeNode(nodeAddress);
                toast.success('Node revoked');
              })}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Revoke'}
            </button>
          </div>
        </div>

        <div className="card space-y-4">
          <div className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-primary-500" />
            <h2 className="text-xl font-semibold">Token Rate</h2>
          </div>

          <input
            value={tokenRate}
            onChange={(e) => setTokenRateValue(e.target.value)}
            placeholder="Token rate"
            className="input-field"
            type="number"
            min="0"
          />

          <button
            className="btn-primary"
            disabled={loading || tokenRate === ''}
            onClick={() => withLoading(async () => {
              await setTokenRate(Number(tokenRate));
              toast.success('Token rate updated');
            })}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update Token Rate'}
          </button>
        </div>

        <div className="card space-y-4 lg:col-span-2">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary-500" />
            <h2 className="text-xl font-semibold">Evaluation Weights</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input className="input-field" type="number" min="0" value={weights.accuracy} onChange={(e) => setWeights((w) => ({ ...w, accuracy: e.target.value }))} placeholder="Accuracy" />
            <input className="input-field" type="number" min="0" value={weights.efficiency} onChange={(e) => setWeights((w) => ({ ...w, efficiency: e.target.value }))} placeholder="Efficiency" />
            <input className="input-field" type="number" min="0" value={weights.reliability} onChange={(e) => setWeights((w) => ({ ...w, reliability: e.target.value }))} placeholder="Reliability" />
            <input className="input-field" type="number" min="0" value={weights.responseTime} onChange={(e) => setWeights((w) => ({ ...w, responseTime: e.target.value }))} placeholder="Response Time" />
          </div>

          <button
            className="btn-primary"
            disabled={loading}
            onClick={() => withLoading(async () => {
              await setEvaluationWeights(
                Number(weights.accuracy),
                Number(weights.efficiency),
                Number(weights.reliability),
                Number(weights.responseTime)
              );
              toast.success('Evaluation weights updated');
            })}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update Weights'}
          </button>
        </div>

        <div className="card space-y-4 lg:col-span-2">
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary-500" />
            <h2 className="text-xl font-semibold">Model Evaluation Score</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              className="input-field"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              placeholder="Model ID"
              type="number"
              min="1"
            />
            <input
              className="input-field"
              value={score}
              onChange={(e) => setScore(e.target.value)}
              placeholder="Score (0-1000)"
              type="number"
              min="0"
              max="1000"
            />
          </div>

          <button
            className="btn-primary"
            disabled={loading || !modelId}
            onClick={() => withLoading(async () => {
              await setEvaluationScore(Number(modelId), Number(score));
              toast.success('Model score updated');
            })}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Set Evaluation Score'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AdminPanel;
