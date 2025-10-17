// frontend/src/pages/Dashboard.jsx
import { useState, useEffect } from 'react';
import { useWeb3 } from '../context/Web3Context';
import { TrendingUp, Zap, DollarSign, Activity, Clock, CheckCircle } from 'lucide-react';
import { ethers } from 'ethers';

export default function Dashboard() {
  const { contracts, account } = useWeb3();
  const [stats, setStats] = useState({
    totalRequests: 0,
    totalSpent: '0',
    completedRequests: 0,
    pendingRequests: 0
  });
  const [recentInferences, setRecentInferences] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (contracts.inferenceMarket && account) {
      fetchDashboardData();
    }
  }, [contracts.inferenceMarket, account]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Get total requests count
      const requestCounter = await contracts.inferenceMarket.requestCounter();
      const totalRequests = Number(requestCounter);
      
      let userRequests = [];
      let totalSpent = ethers.parseEther('0');
      let completed = 0;
      let pending = 0;

      // Fetch user's requests (in production, use events/indexer)
      for (let i = 1; i <= totalRequests; i++) {
        try {
          const request = await contracts.inferenceMarket.inferenceRequests(i);
          
          if (request.requester.toLowerCase() === account.toLowerCase()) {
            userRequests.push({
              id: i,
              modelId: request.modelId,
              payment: request.payment,
              status: request.status,
              timestamp: request.timestamp
            });

            totalSpent = totalSpent + request.payment;
            
            if (request.status === 3) { // Completed
              completed++;
            } else if (request.status === 1) { // Pending
              pending++;
            }
          }
        } catch (error) {
          console.error(`Error fetching request ${i}:`, error);
        }
      }

      setStats({
        totalRequests: userRequests.length,
        totalSpent: ethers.formatEther(totalSpent),
        completedRequests: completed,
        pendingRequests: pending
      });

      setRecentInferences(userRequests.slice(-10).reverse());
      
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      0: { text: 'Created', color: 'blue' },
      1: { text: 'Pending', color: 'yellow' },
      2: { text: 'Computing', color: 'purple' },
      3: { text: 'Completed', color: 'green' },
      4: { text: 'Refunded', color: 'red' }
    };

    const statusInfo = statusMap[status] || { text: 'Unknown', color: 'gray' };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium border
        ${statusInfo.color === 'green' ? 'bg-green-500/20 text-green-400 border-green-400/30' : ''}
        ${statusInfo.color === 'yellow' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-400/30' : ''}
        ${statusInfo.color === 'blue' ? 'bg-blue-500/20 text-blue-400 border-blue-400/30' : ''}
        ${statusInfo.color === 'purple' ? 'bg-purple-500/20 text-purple-400 border-purple-400/30' : ''}
        ${statusInfo.color === 'red' ? 'bg-red-500/20 text-red-400 border-red-400/30' : ''}
        ${statusInfo.color === 'gray' ? 'bg-gray-500/20 text-gray-400 border-gray-400/30' : ''}
      `}>
        {statusInfo.text}
      </span>
    );
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(Number(timestamp) * 1000);
    return date.toLocaleString();
  };

  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-12 border border-purple-500/30 text-center max-w-md">
          <div className="w-20 h-20 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Activity className="h-10 w-10 text-purple-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-4">Connect Your Wallet</h2>
          <p className="text-gray-400">
            Please connect your wallet to view your dashboard and inference history.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Dashboard</h1>
        <p className="text-gray-400">Track your AI model usage and spending</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Total Requests */}
        <div className="bg-gradient-to-br from-purple-600/20 to-purple-800/20 rounded-xl p-6 border border-purple-500/30">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <Zap className="h-6 w-6 text-purple-400" />
            </div>
            <TrendingUp className="h-5 w-5 text-purple-400" />
          </div>
          <h3 className="text-gray-400 text-sm font-medium mb-1">Total Requests</h3>
          <p className="text-3xl font-bold text-white">{stats.totalRequests}</p>
        </div>

        {/* Total Spent */}
        <div className="bg-gradient-to-br from-pink-600/20 to-pink-800/20 rounded-xl p-6 border border-pink-500/30">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-pink-500/20 rounded-lg flex items-center justify-center">
              <DollarSign className="h-6 w-6 text-pink-400" />
            </div>
            <TrendingUp className="h-5 w-5 text-pink-400" />
          </div>
          <h3 className="text-gray-400 text-sm font-medium mb-1">Total Spent</h3>
          <p className="text-3xl font-bold text-white">
            {Number(stats.totalSpent).toFixed(4)} <span className="text-lg text-pink-300">ETH</span>
          </p>
        </div>

        {/* Completed */}
        <div className="bg-gradient-to-br from-green-600/20 to-green-800/20 rounded-xl p-6 border border-green-500/30">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-green-400" />
            </div>
            <Activity className="h-5 w-5 text-green-400" />
          </div>
          <h3 className="text-gray-400 text-sm font-medium mb-1">Completed</h3>
          <p className="text-3xl font-bold text-white">{stats.completedRequests}</p>
        </div>

        {/* Pending */}
        <div className="bg-gradient-to-br from-yellow-600/20 to-yellow-800/20 rounded-xl p-6 border border-yellow-500/30">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-yellow-500/20 rounded-lg flex items-center justify-center">
              <Clock className="h-6 w-6 text-yellow-400" />
            </div>
            <Activity className="h-5 w-5 text-yellow-400" />
          </div>
          <h3 className="text-gray-400 text-sm font-medium mb-1">Pending</h3>
          <p className="text-3xl font-bold text-white">{stats.pendingRequests}</p>
        </div>
      </div>

      {/* Recent Inferences */}
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl border border-purple-500/30 overflow-hidden">
        <div className="p-6 border-b border-purple-500/20">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Recent Inferences</h2>
              <p className="text-gray-400 text-sm">Your latest AI model requests</p>
            </div>
            <button
              onClick={fetchDashboardData}
              className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 px-4 py-2 rounded-lg border border-purple-400/30 transition-all flex items-center"
            >
              <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-400 mb-4"></div>
            <p className="text-gray-400">Loading your data...</p>
          </div>
        ) : recentInferences.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <Zap className="h-8 w-8 text-gray-600" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">No Inferences Yet</h3>
            <p className="text-gray-400 mb-6">Start using AI models from the marketplace!</p>
            <a
              href="/"
              className="inline-block bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold px-6 py-3 rounded-lg transition-all"
            >
              Browse Models
            </a>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-900/50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Request ID
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Model ID
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {recentInferences.map((inference) => (
                  <tr key={inference.id} className="hover:bg-gray-900/30 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-purple-300 font-mono text-sm">#{inference.id}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-white font-medium">Model #{inference.modelId.toString()}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-white font-mono">
                        {ethers.formatEther(inference.payment)} ETH
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(inference.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-400 text-sm">
                      {formatTimestamp(inference.timestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}