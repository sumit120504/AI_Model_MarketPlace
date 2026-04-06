import { Link } from 'react-router-dom';
import { useWeb3 } from '../../context/Web3Context';
import { Wallet, LogOut, Activity } from 'lucide-react';

function Navbar() {
  const { account, isConnected, isAdmin, balance, connectWallet, disconnectWallet } = useWeb3();

  const formatAddress = (address) => {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  return (
    <nav className="sticky top-0 z-30 border-b border-white/10 bg-[#0a1325]/70 backdrop-blur-xl">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2">
            <div className="h-9 w-9 rounded-xl bg-cyan-400/10 border border-cyan-300/30 grid place-items-center">
              <Activity className="h-5 w-5 text-cyan-300" />
            </div>
            <span className="text-xl font-bold gradient-text">
              AI Marketplace
            </span>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center space-x-8">
            <Link
              to="/"
              className="text-slate-300 hover:text-cyan-200 transition-colors"
            >
              Home
            </Link>
            <Link
              to="/marketplace"
              className="text-slate-300 hover:text-cyan-200 transition-colors"
            >
              Marketplace
            </Link>
            <Link
              to="/dashboard"
              className="text-slate-300 hover:text-cyan-200 transition-colors"
            >
              Dashboard
            </Link>
            {isConnected && (
              <Link
                to="/compute"
                className="text-slate-300 hover:text-cyan-200 transition-colors"
              >
                Compute
              </Link>
            )}
            {isAdmin && (
              <Link
                to="/admin"
                className="text-slate-300 hover:text-cyan-200 transition-colors"
              >
                Admin
              </Link>
            )}
          </div>

          {/* Wallet Connection */}
          <div className="flex items-center space-x-4">
            {isConnected ? (
              <>
                <div className="hidden md:block text-sm">
                  <div className="text-slate-400">Balance</div>
                  <div className="text-slate-100 font-medium">
                    {parseFloat(balance).toFixed(4)} MATIC
                  </div>
                </div>
                <div className="flex items-center space-x-2 bg-[#12213a]/80 px-4 py-2 rounded-xl border border-slate-600/50">
                  <div className="h-2 w-2 bg-green-500 rounded-full"></div>
                  <span className="text-slate-100 font-medium">
                    {formatAddress(account)}
                  </span>
                </div>
                <button
                  onClick={disconnectWallet}
                  className="p-2 text-slate-400 hover:text-white transition-colors"
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