/**
 * Inference request stages and their descriptions
 */
export const INFERENCE_STAGES = {
  PENDING: { stage: 0, statusText: 'PENDING', description: 'Request received' },
  DOWNLOADING: { stage: 1, statusText: 'DOWNLOADING', description: 'Downloading model' },
  INITIALIZING: { stage: 2, statusText: 'INITIALIZING', description: 'Loading model' },
  PROCESSING: { stage: 3, statusText: 'PROCESSING', description: 'Running inference' },
  SAVING: { stage: 4, statusText: 'SAVING', description: 'Saving results' },
  COMPLETED: { stage: 5, statusText: 'COMPLETED', description: 'Request completed' },
  FAILED: { stage: -1, statusText: 'FAILED', description: 'Request failed' }
};

/**
 * Get stage details by status text
 */
export function getStageByStatus(statusText) {
  return Object.values(INFERENCE_STAGES).find(s => s.statusText === statusText) || INFERENCE_STAGES.PENDING;
}

/**
 * Calculate progress percentage based on stage
 */
export function getProgressPercentage(stage) {
  // Map stages to percentage ranges
  const stageRanges = {
    0: [0, 10],    // PENDING
    1: [10, 30],   // DOWNLOADING
    2: [30, 50],   // INITIALIZING
    3: [50, 80],   // PROCESSING
    4: [80, 95],   // SAVING
    5: [100, 100], // COMPLETED
    '-1': [0, 0]   // FAILED
  };

  const [min, max] = stageRanges[stage] || [0, 0];
  return Math.floor(min + (Math.random() * (max - min))); // Randomize within stage range
}