import { useEffect, useState } from 'react';
import { useWeb3 } from '../context/Web3Context';
import { Cpu, Loader2, Wallet, RefreshCw, CheckCircle2 } from 'lucide-react';
import { formatDistance } from 'date-fns';
import toast from 'react-hot-toast';
import { getStatusInfo } from '../config/contracts';

function ComputeNode() {
  const {
    isConnected,
    account,
    isAuthorizedComputeNode,
    getPendingRequests,
    pickupRequest,
    getNodeEarnings,
    withdrawNodeEarnings
  } = useWeb3();

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [nodeEarnings, setNodeEarnings] = useState('0');

  useEffect(() => {
    if (!isConnected || !account) {
      setLoading(false);
      setAuthorized(false);
      setPendingRequests([]);
      setNodeEarnings('0');
      return;
    }

    loadNodeData();
  }, [isConnected, account]);

  const loadNodeData = async () => {
    try {
      setLoading(true);

      const [authorizedNode, earnings] = await Promise.all([
        isAuthorizedComputeNode(account),
        getNodeEarnings(account)
      ]);

      setAuthorized(authorizedNode);
      setNodeEarnings(earnings || '0');

      if (authorizedNode) {
        const queue = await getPendingRequests();
        setPendingRequests(queue || []);
      } else {
        setPendingRequests([]);
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to load compute node data');
    } finally {
      setLoading(false);
    }
  };

  const withAction = async (fn) => {
    try {
      setActionLoading(true);
      await fn();
      await loadNodeData();
    } catch (error) {
      console.error(error);
    } finally {
      setActionLoading(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold mb-4">Connect Your Wallet</h2>
        <p className="text-gray-400">Please connect a compute-node wallet to continue.</p>
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

  if (!authorized) {
    return (
      <div className="text-center py-20 max-w-2xl mx-auto">
        <Cpu className="h-12 w-12 mx-auto text-yellow-500 mb-4" />
        <h2 className="text-2xl font-bold mb-2">Node Not Authorized</h2>
        <p className="text-gray-400">
          This wallet is not an authorized compute node. Ask the contract owner to authorize your address.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Compute Node Interface</h1>
          <p className="text-gray-400">Monitor pending jobs, pick requests, and manage node earnings.</p>
        </div>
        <button
          className="btn-secondary flex items-center gap-2"
          disabled={loading || actionLoading}
          onClick={loadNodeData}
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card">
          <div className="text-gray-400 text-sm mb-2">Node Status</div>
          <div className="text-xl font-bold text-green-400 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            Authorized
          </div>
        </div>
        <div className="card">
          <div className="text-gray-400 text-sm mb-2">Pending Queue</div>
          <div className="text-3xl font-bold">{pendingRequests.length}</div>
        </div>
        <div className="card flex items-center justify-between">
          <div>
            <div className="text-gray-400 text-sm mb-2">Node Earnings</div>
            <div className="text-2xl font-bold text-primary-400">
              {parseFloat(nodeEarnings || '0').toFixed(4)} MATIC
            </div>
          </div>
          <button
            className="btn-primary"
            disabled={actionLoading || parseFloat(nodeEarnings || '0') <= 0}
            onClick={() => withAction(async () => {
              await withdrawNodeEarnings();
              toast.success('Node earnings withdrawn');
            })}
          >
            <Wallet className="h-4 w-4" />
            <span>Claim</span>
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-bold">Pending Requests</h2>

        {pendingRequests.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-400">No pending requests right now.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingRequests.map((request) => {
              const status = getStatusInfo(request.status);
              return (
                <div key={request.id} className="card">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">Request #{request.id}</span>
                        <span className={`badge badge-${status.color}`}>{status.label}</span>
                      </div>
                      <div className="text-sm text-gray-300 grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>Model: #{request.modelId}</div>
                        <div>Payment: {request.payment} MATIC</div>
                        <div>
                          Created {request.createdAt ? formatDistance(request.createdAt, new Date(), { addSuffix: true }) : 'unknown'}
                        </div>
                      </div>
                    </div>

                    <button
                      className="btn-primary"
                      disabled={actionLoading}
                      onClick={() => withAction(async () => {
                        await pickupRequest(request.id);
                        toast.success(`Picked request #${request.id}`);
                      })}
                    >
                      Pick Request
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default ComputeNode;
