import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useWeb3 } from './context/Web3Context';
import Navbar from './components/layout/Navbar';
import Home from './pages/Home';
import Marketplace from './pages/Marketplace';
import Dashboard from './pages/Dashboard';
import ModelDetails from './pages/ModelDetails';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-950">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/marketplace" element={<Marketplace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/model/:id" element={<ModelDetails />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;