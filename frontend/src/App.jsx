// frontend/src/App.jsx
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Web3Provider } from './context/Web3Context';
import Layout from './components/Layout';
import Marketplace from './pages/Marketplace';
import Dashboard from './pages/Dashboard';
import MyModels from './pages/MyModels';

function App() {
  return (
    <Web3Provider>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Marketplace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/my-models" element={<MyModels />} />
          </Routes>
        </Layout>
      </Router>
    </Web3Provider>
  );
}

export default App;