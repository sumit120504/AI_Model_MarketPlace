import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useWeb3 } from './context/Web3Context';
import Navbar from './components/layout/Navbar';
import Home from './pages/Home';
import Marketplace from './pages/Marketplace';
import Dashboard from './pages/Dashboard';
import ModelDetails from './pages/ModelDetails';
import AdminPanel from './pages/AdminPanel';
import ComputeNode from './pages/ComputeNode';

function App() {
  return (
    <Router>
      <div className="min-h-screen relative overflow-x-hidden">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="float-blob absolute -top-24 -left-20 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="float-blob absolute top-48 -right-24 h-80 w-80 rounded-full bg-amber-300/10 blur-3xl" />
          <div className="float-blob absolute bottom-8 left-1/3 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />
        </div>
        <Navbar />
        <main className="container mx-auto px-4 py-8 md:py-10 relative z-10">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/marketplace" element={<Marketplace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/model/:id" element={<ModelDetails />} />
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="/compute" element={<ComputeNode />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;