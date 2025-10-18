import { useState, useEffect } from 'react';
import { useWeb3 } from '../context/Web3Context';
import { Loader2, History, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import { getStatusInfo } from '../config/contracts';
import { formatDistance } from 'date-fns';

function Dashboard() {
  const { account, isConnected, getUserRequests, getCreatorModels } = useWeb3();
  
  const [requests, setRequests] = useState([]);
  const [myModels, setMyModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('requests'); // 'requests' or 'models'

  useEffect(() => {
    if (isConnected && account) {
      loadDashboardData();
    }
  }, [isConnected, account]);

  async function loadDashboardData() {
    try {
      setLoading(true);
      
      // Load user's inference requests
      const userRequests = await getUserRequests(account);
      setRequests(userRequests);
      
      // Load user's models (if creator)
      const creatorModels = await getCreatorModels(account);
      setMyModels(creatorModels);
      
    } catch (error) {
      console.error('Error loading dashboard:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }

  if (!isConnected) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold mb-4">Connect Your Wallet</h2>
        <p className="text-gray-400">
          Please connect your wallet to view your dashboard
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

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-gray-400">
          View your inference requests and manage your models
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card">
          <div className="text-gray-400 text-sm mb-2">Total Requests</div>
          <div className="text-3xl font-bold">{requests.length}</div>
        </div>
        <div className="card">
          <div className="text-gray-400 text-sm mb-2">My Models</div>
          <div className="text-3xl font-bold">{myModels.length}</div>
        </div>
        <div className="card">
          <div className="text-gray-400 text-sm mb-2">Total Spent</div>
          <div className="text-3xl font-bold text-primary-400">
            {requests.reduce((sum, req) => sum + parseFloat(req.payment), 0).toFixed(4)} MATIC
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-4 border-b border-gray-800">
        <button
          onClick={() => setActiveTab('requests')}
          className={`pb-4 px-2 font-medium transition-colors relative ${
            activeTab === 'requests'
              ? 'text-primary-500'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <div className="flex items-center space-x-2">
            <History className="h-5 w-5" />
            <span>My Requests</span>
          </div>
          {activeTab === 'requests' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500" />
          )}
        </button>
        
        <button
          onClick={() => setActiveTab('models')}
          className={`pb-4 px-2 font-medium transition-colors relative ${
            activeTab === 'models'
              ? 'text-primary-500'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <div className="flex items-center space-x-2">
            <Package className="h-5 w-5" />
            <span>My Models</span>
          </div>
          {activeTab === 'models' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500" />
          )}
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'requests' ? (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">Inference Requests</h2>
          
          {requests.length === 0 ? (
            <div className="card text-center py-12">
              <History className="h-12 w-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">No inference requests yet</p>
              <p className="text-sm text-gray-500 mt-2">
                Visit the marketplace to use AI models
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {requests.map((request) => {
                const statusInfo = getStatusInfo(request.status);
                return (
                  <div key={request.id} className="card">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <span className="text-lg font-semibold">
                            Request #{request.id}
                          </span>
                          <span className={`badge badge-${statusInfo.color}`}>
                            {statusInfo.label}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <div className="text-gray-400">Model ID</div>
                            <div className="font-medium">#{request.modelId}</div>
                          </div>
                          <div>
                            <div className="text-gray-400">Payment</div>
                            <div className="font-medium">{request.payment} MATIC</div>
                          </div>
                          <div>
                            <div className="text-gray-400">Created</div>
                            <div className="font-medium">
                              {formatDistance(request.createdAt, new Date(), { addSuffix: true })}
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-400">Result Hash</div>
                            <div className="font-mono text-xs">
                              {request.resultHash === '0x0000000000000000000000000000000000000000000000000000000000000000'
                                ? 'Pending...'
                                : `${request.resultHash.substring(0, 10)}...`
                              }
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">My Models</h2>
          
          {myModels.length === 0 ? (
            <div className="card text-center py-12">
              <Package className="h-12 w-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">No models registered yet</p>
              <p className="text-sm text-gray-500 mt-2">
                Register your first AI model to start earning
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {myModels.map((model) => (
                <div key={model.id} className="card">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-semibold mb-1">{model.name}</h3>
                      <span className={`badge ${model.isActive ? 'badge-success' : 'badge-error'}`}>
                        {model.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-gray-400 text-sm">Earnings</div>
                      <div className="text-xl font-bold text-primary-400">
                        {parseFloat(model.totalEarnings).toFixed(4)} MATIC
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-gray-400">Uses</div>
                      <div className="font-semibold">{model.totalInferences}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">Price</div>
                      <div className="font-semibold">{model.price} MATIC</div>
                    </div>
                    <div>
                      <div className="text-gray-400">Reputation</div>
                      <div className="font-semibold">
                        {(parseInt(model.reputation) / 10).toFixed(1)}/100
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Dashboard;