import { Link } from 'react-router-dom';
import { useWeb3 } from '../context/Web3Context';
import { Sparkles, Shield, Zap, TrendingUp } from 'lucide-react';

function Home() {
  const { isConnected, connectWallet } = useWeb3();

  const features = [
    {
      icon: Sparkles,
      title: 'Decentralized AI',
      description: 'Run AI models on blockchain with cryptographic proof'
    },
    {
      icon: Shield,
      title: 'Secure & Transparent',
      description: 'All transactions verified on-chain with full transparency'
    },
    {
      icon: Zap,
      title: 'Pay Per Use',
      description: 'No subscriptions. Only pay for what you use'
    },
    {
      icon: TrendingUp,
      title: 'Earn as Creator',
      description: 'Monetize your AI models and earn 85% of fees'
    }
  ];

  return (
    <div className="max-w-7xl mx-auto">
      {/* Hero Section */}
      <div className="text-center py-20 space-y-8">
        <h1 className="text-5xl md:text-7xl font-bold">
          <span className="gradient-text">Decentralized AI</span>
          <br />
          Model Marketplace
        </h1>
        <p className="text-xl text-gray-400 max-w-2xl mx-auto">
          Run AI inference on blockchain. Verifiable, transparent, and permissionless.
        </p>
        <div className="flex items-center justify-center space-x-4">
          {isConnected ? (
            <Link to="/marketplace" className="btn-primary text-lg">
              Browse Models
            </Link>
          ) : (
            <button onClick={connectWallet} className="btn-primary text-lg">
              Get Started
            </button>
          )}
          <Link to="/marketplace" className="btn-outline text-lg">
            Learn More
          </Link>
        </div>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 py-16">
        {features.map((feature, index) => (
          <div
            key={index}
            className="card card-hover text-center space-y-4 animate-fadeIn"
            style={{ animationDelay: `${index * 0.1}s` }}
          >
            <div className="flex justify-center">
              <div className="p-3 bg-primary-900/30 rounded-lg">
                <feature.icon className="h-8 w-8 text-primary-500" />
              </div>
            </div>
            <h3 className="text-xl font-semibold">{feature.title}</h3>
            <p className="text-gray-400">{feature.description}</p>
          </div>
        ))}
      </div>

      {/* Stats Section */}
      <div className="glass rounded-2xl p-8 my-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          <div>
            <div className="text-4xl font-bold text-primary-500">1</div>
            <div className="text-gray-400 mt-2">Active Models</div>
          </div>
          <div>
            <div className="text-4xl font-bold text-primary-500">0</div>
            <div className="text-gray-400 mt-2">Total Inferences</div>
          </div>
          <div>
            <div className="text-4xl font-bold text-primary-500">0</div>
            <div className="text-gray-400 mt-2">Creators Earning</div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="text-center py-16 space-y-6">
        <h2 className="text-3xl md:text-4xl font-bold">
          Ready to get started?
        </h2>
        <p className="text-gray-400 text-lg">
          Connect your wallet and start using AI models on blockchain
        </p>
        {!isConnected && (
          <button onClick={connectWallet} className="btn-primary text-lg">
            Connect Wallet Now
          </button>
        )}
      </div>
    </div>
  );
}

export default Home;