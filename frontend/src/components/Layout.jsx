// frontend/src/components/Layout.jsx
import { useState } from 'react';
import { useWeb3 } from '../context/Web3Context';
import { Menu, X, Zap, TrendingUp, User, LogOut } from 'lucide-react';

export default function Layout({ children }) {
  const { account, connectWallet, disconnectWallet } = useWeb3();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const truncateAddress = (address) => {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      {/* Navigation */}
      <nav className="bg-black bg-opacity-50 backdrop-blur-lg border-b border-purple-500/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            {/* Logo */}
            <div className="flex items-center">
              <Zap className="h-8 w-8 text-purple-400" />
              <span className="ml-2 text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                NeuralMarket
              </span>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-8">
              <a href="/" className="text-gray-300 hover:text-purple-400 transition-colors">
                Marketplace
              </a>
              <a href="/dashboard" className="text-gray-300 hover:text-purple-400 transition-colors">
                Dashboard
              </a>
              <a href="/my-models" className="text-gray-300 hover:text-purple-400 transition-colors">
                My Models
              </a>

              {/* Wallet Button */}
              {account ? (
                <div className="flex items-center space-x-4">
                  <div className="bg-purple-500/20 px-4 py-2 rounded-lg border border-purple-400/30">
                    <span className="text-purple-300 font-mono text-sm">
                      {truncateAddress(account)}
                    </span>
                  </div>
                  <button
                    onClick={disconnectWallet}
                    className="bg-red-500/20 hover:bg-red-500/30 text-red-300 px-4 py-2 rounded-lg border border-red-400/30 transition-all"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={connectWallet}
                  className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold px-6 py-2 rounded-lg shadow-lg shadow-purple-500/50 transition-all transform hover:scale-105"
                >
                  Connect Wallet
                </button>
              )}
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden flex items-center">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="text-gray-300 hover:text-purple-400"
              >
                {mobileMenuOpen ? (
                  <X className="h-6 w-6" />
                ) : (
                  <Menu className="h-6 w-6" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-black bg-opacity-90 border-t border-purple-500/20">
            <div className="px-4 pt-2 pb-4 space-y-3">
              <a
                href="/"
                className="block text-gray-300 hover:text-purple-400 py-2 transition-colors"
              >
                Marketplace
              </a>
              <a
                href="/dashboard"
                className="block text-gray-300 hover:text-purple-400 py-2 transition-colors"
              >
                Dashboard
              </a>
              <a
                href="/my-models"
                className="block text-gray-300 hover:text-purple-400 py-2 transition-colors"
              >
                My Models
              </a>
              
              {account ? (
                <>
                  <div className="bg-purple-500/20 px-4 py-2 rounded-lg border border-purple-400/30">
                    <span className="text-purple-300 font-mono text-sm">
                      {truncateAddress(account)}
                    </span>
                  </div>
                  <button
                    onClick={disconnectWallet}
                    className="w-full bg-red-500/20 hover:bg-red-500/30 text-red-300 px-4 py-2 rounded-lg border border-red-400/30 transition-all"
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <button
                  onClick={connectWallet}
                  className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold px-6 py-2 rounded-lg shadow-lg"
                >
                  Connect Wallet
                </button>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-black bg-opacity-50 backdrop-blur-lg border-t border-purple-500/20 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center text-gray-400">
            <p className="text-sm">
              © 2025 NeuralMarket - Decentralized AI Model Marketplace
            </p>
            <p className="text-xs mt-2 text-gray-500">
              Built on Polygon • Powered by blockchain & Zero-Knowledge Proofs
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}