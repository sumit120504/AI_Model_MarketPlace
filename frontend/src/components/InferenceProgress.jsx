import { Loader2 } from 'lucide-react';

const InferenceProgress = ({ status, elapsedTime }) => {
  const getStatusColor = (status) => {
    switch (status) {
      case 'COMPUTING':
        return 'text-blue-400';
      case 'COMPLETED':
        return 'text-green-400';
      case 'FAILED':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  const getStatusMessage = (status) => {
    switch (status) {
      case 'PENDING':
        return 'Waiting for compute node...';
      case 'COMPUTING':
        return 'Processing inference...';
      case 'COMPLETED':
        return 'Inference completed!';
      case 'FAILED':
        return 'Inference failed';
      default:
        return 'Initializing...';
    }
  };

  const formatElapsedTime = (ms) => {
    if (!ms) return '';
    const seconds = Math.floor(ms / 1000);
    return seconds > 0 ? `${seconds}s` : '<1s';
  };

  return (
    <div className="flex items-center space-x-3 text-sm">
      {status === 'COMPUTING' && (
        <Loader2 className="h-4 w-4 animate-spin" />
      )}
      <span className={getStatusColor(status)}>
        {getStatusMessage(status)}
      </span>
      {elapsedTime > 0 && (
        <span className="text-gray-500">
          ({formatElapsedTime(elapsedTime)})
        </span>
      )}
    </div>
  );
};

export default InferenceProgress;