import { Link } from 'react-router-dom';
import { useWeb3 } from '../../context/Web3Context';
import { Wallet, LogOut, Activity } from 'lucide-react';

function Navbar() {
  const { account, isConnected, balance, connectWallet, disconnectWallet } = useWeb3();

  const formatAddress = (address) => {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  return (
    <nav className="bg-gray-900 border-b border-gray-800">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2">
            <Activity className="h-8 w-8 text-primary-500" />
            <span className="text-xl font-bold gradient-text">
              AI Marketplace
            </span>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center space-x-8">
            <Link
              to="/"
              className="text-gray-300 hover:text-white transition-colors"
            >
              Home
            </Link>
            <Link
              to="/marketplace"
              className="text-gray-300 hover:text-white transition-colors"
            >
              Marketplace
            </Link>
            <Link
              to="/dashboard"
              className="text-gray-300 hover:text-white transition-colors"
            >
              Dashboard
            </Link>
          </div>

          {/* Wallet Connection */}
          <div className="flex items-center space-x-4">
            {isConnected ? (
              <>
                <div className="hidden md:block text-sm">
                  <div className="text-gray-400">Balance</div>
                  <div className="text-white font-medium">
                    {parseFloat(balance).toFixed(4)} MATIC
                  </div>
                </div>
                <div className="flex items-center space-x-2 bg-gray-800 px-4 py-2 rounded-lg">
                  <div className="h-2 w-2 bg-green-500 rounded-full"></div>
                  <span className="text-white font-medium">
                    {formatAddress(account)}
                  </span>
                </div>
                <button
                  onClick={disconnectWallet}
                  className="p-2 text-gray-400 hover:text-white transition-colors"
                  title="Disconnect"
                >
                  <LogOut className="h-5 w-5" />
                </button>
              </>
            ) : (
              <button
                onClick={connectWallet}
                className="btn-primary flex items-center space-x-2"
              >
                <Wallet className="h-5 w-5" />
                <span>Connect Wallet</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;