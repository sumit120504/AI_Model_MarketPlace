import { Link } from 'react-router-dom';
import { useWeb3 } from '../context/Web3Context';
import { Sparkles, Shield, Zap, TrendingUp } from 'lucide-react';

function Home() {
  const { isConnected, connectWallet } = useWeb3();

  const features = [
    {
      icon: Sparkles,
      title: 'Nexus Ecosystem',
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center py-14 md:py-20">
        <div className="space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-1 text-sm text-cyan-100">
            <Sparkles className="h-4 w-4" />
            Trusted AI Inference on Chain
          </div>
          <h1 className="text-5xl md:text-7xl font-bold leading-[1.05]">
            <span className="gradient-text">Nexus</span>
            <br />
            Decentralized AI Models Marketplace
          </h1>
          <p className="text-lg md:text-xl text-slate-300 max-w-2xl">
            Monetize creator-built models, run verifiable inference, and keep every decision auditable with blockchain-native execution flows.
          </p>
          <div className="flex flex-wrap items-center gap-4">
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

        <div className="grid grid-cols-2 gap-4">
          <div
            className="hero-image-card card-hover"
            style={{ backgroundImage: "url('https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&w=900&q=80')" }}
          >
            <div className="relative z-10 p-4 pt-20 text-sm text-white/90">Text Classification</div>
          </div>
          <div
            className="hero-image-card card-hover"
            style={{ backgroundImage: "url('https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=900&q=80')" }}
          >
            <div className="relative z-10 p-4 pt-20 text-sm text-white/90">Image Intelligence</div>
          </div>
          <div
            className="hero-image-card card-hover col-span-2"
            style={{ backgroundImage: "url('https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?auto=format&fit=crop&w=1200&q=80')" }}
          >
            <div className="relative z-10 p-4 pt-20 text-sm text-white/90">Creator-Owned Models, Encrypted Artifacts</div>
          </div>
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
              <div className="p-3 bg-cyan-300/10 rounded-xl border border-cyan-300/30">
                <feature.icon className="h-8 w-8 text-cyan-300" />
              </div>
            </div>
            <h3 className="text-xl font-semibold">{feature.title}</h3>
            <p className="text-slate-300">{feature.description}</p>
          </div>
        ))}
      </div>

      {/* Stats Section */}
      <div className="glass rounded-2xl p-8 my-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          <div>
            <div className="text-4xl font-bold text-cyan-300">1</div>
            <div className="text-slate-300 mt-2">Active Models</div>
          </div>
          <div>
            <div className="text-4xl font-bold text-cyan-300">0</div>
            <div className="text-slate-300 mt-2">Total Inferences</div>
          </div>
          <div>
            <div className="text-4xl font-bold text-cyan-300">0</div>
            <div className="text-slate-300 mt-2">Creators Earning</div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="text-center py-16 space-y-6">
        <h2 className="text-3xl md:text-4xl font-bold">
          Ready to get started?
        </h2>
        <p className="text-slate-300 text-lg">
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