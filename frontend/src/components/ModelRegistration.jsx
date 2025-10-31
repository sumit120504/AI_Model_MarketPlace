import { useState, useRef } from 'react';
import { useWeb3 } from '../context/Web3Context';
import { X, Upload, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { BACKEND_API_URL } from '../config/contracts';

function ModelRegistration({ isOpen, onClose }) {
  const { registerModel } = useWeb3();
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 0,
    price: '',
    stake: '',
    ipfsHash: ''
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef();
  // Upload model file to backend (or IPFS proxy)
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      // Upload to backend upload endpoint
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${BACKEND_API_URL}/api/upload-model`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      if (!data.ipfsHash) throw new Error('No IPFS hash returned');
      setFormData(prev => ({ ...prev, ipfsHash: data.ipfsHash }));
      toast.success('Model uploaded to IPFS!');
    } catch (err) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const categories = [
    { value: 0, label: 'Text Classification' },
    { value: 1, label: 'Image Classification' },
    { value: 2, label: 'Sentiment Analysis' },
    { value: 3, label: 'Other' }
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error('Model name is required');
      return;
    }
    
    if (!formData.description.trim()) {
      toast.error('Model description is required');
      return;
    }
    
    if (!formData.price || parseFloat(formData.price) <= 0) {
      toast.error('Price must be greater than 0');
      return;
    }
    
    if (!formData.stake || parseFloat(formData.stake) < 0.01) {
      toast.error('Stake must be at least 0.01 MATIC');
      return;
    }
    
    if (!formData.ipfsHash.trim()) {
      toast.error('IPFS hash is required');
      return;
    }

    try {
      setIsSubmitting(true);
      
      // Call web3 context to register with user's wallet
      const modelId = await registerModel(
        formData.ipfsHash,
        formData.name,
        formData.description,
        parseInt(formData.category),
        formData.price,
        formData.stake
      );
      
      toast.success(`Model registered successfully! ID: ${modelId}`);
      onClose();
      
      // Reset form
      setFormData({
        name: '',
        description: '',
        category: 0,
        price: '',
        stake: '',
        ipfsHash: ''
      });
      
    } catch (error) {
      console.error('Error registering model:', error);
      toast.error('Failed to register model');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">Register New Model</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Model Name */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Model Name *
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g., Spam Detector Pro"
                className="input w-full"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Description *
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Describe your model's capabilities..."
                className="input w-full min-h-[100px] resize-none"
                required
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Category *
              </label>
              <select
                name="category"
                value={formData.category}
                onChange={handleChange}
                className="input w-full"
                required
              >
                {categories.map(cat => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Price and Stake */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Price per Inference (MATIC) *
                </label>
                <input
                  type="number"
                  name="price"
                  value={formData.price}
                  onChange={handleChange}
                  placeholder="0.001"
                  step="0.0001"
                  min="0"
                  className="input w-full"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Stake Amount (MATIC) *
                </label>
                <input
                  type="number"
                  name="stake"
                  value={formData.stake}
                  onChange={handleChange}
                  placeholder="0.01"
                  step="0.001"
                  min="0.01"
                  className="input w-full"
                  required
                />
              </div>
            </div>

            {/* IPFS Hash */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Model File Upload (IPFS) *
              </label>
              <div className="flex flex-col md:flex-row md:space-x-2 space-y-2 md:space-y-0">
                <input
                  type="text"
                  name="ipfsHash"
                  value={formData.ipfsHash}
                  onChange={handleChange}
                  placeholder="QmXxx..."
                  className="input flex-1"
                  required
                  readOnly={isUploading}
                />
                <input
                  type="file"
                  accept=".pt,.pth,.onnx,.h5,.joblib,.pkl,.zip,.tar,.gz,.pb,.tflite,.bin,.model,.sav,.pkl,.pickle,.txt,.json"
                  className="hidden"
                  style={{ maxWidth: 220 }}
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  disabled={isUploading}
                />
                <button
                  type="button"
                  className="btn-outline flex items-center space-x-2"
                  onClick={() => fileInputRef.current && fileInputRef.current.click()}
                  disabled={isUploading}
                >
                  {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  <span>{isUploading ? 'Uploading...' : 'Upload'}</span>
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Upload your model file. The IPFS hash will be filled automatically.<br/>
                Or paste an existing IPFS hash above.
              </p>
            </div>

            {/* Submit Button */}
            <div className="flex space-x-4 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="btn-outline flex-1"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary flex-1 flex items-center justify-center space-x-2"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Registering...</span>
                  </>
                ) : (
                  <span>Register Model</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default ModelRegistration;

