const winston = require('winston');
const { config } = require('../config/config');
const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logDir = path.dirname(config.logFile);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Custom format
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    if (stack) {
      return `[${timestamp}] ${level.toUpperCase()}: ${message}\n${stack}`;
    }
    return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
  })
);

// Create logger
const logger = winston.createLogger({
  level: config.logLevel,
  format: customFormat,
  transports: [
    // Console output
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        customFormat
      )
    }),
    // File output
    new winston.transports.File({
      filename: config.logFile,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

// Helper methods
logger.logInference = (requestId, status, details = {}) => {
  logger.info(`[Inference #${requestId}] ${status}`, details);
};

logger.logTransaction = (txHash, description) => {
  logger.info(`[TX] ${description}: ${txHash}`);
};

logger.logError = (error, context = '') => {
  logger.error(`${context}: ${error.message}`, { stack: error.stack });
};

module.exports = logger;