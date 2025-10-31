import pinataSDK from '@pinata/sdk';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { config } from '../config/config.js';
import logger from '../utils/logger.js';

/**
 * IPFS Service for uploading and downloading files using Helia
 * Supports both direct IPFS and Pinata gateway
 */
class IPFSService {
  constructor() {
    this.pinata = null;
    this.pinataApiKey = config.ipfsApiKey;
    this.pinataSecretKey = config.ipfsSecretKey;
    this.pinataGateway = config.ipfsGateway || 'https://gateway.pinata.cloud/ipfs';
    this.isInitialized = false;
  }

  /**
   * Initialize Pinata connection
   */
  async initialize() {
    try {
      logger.info('Initializing IPFS service with Pinata...');

      if (!this.pinataApiKey || !this.pinataSecretKey) {
        throw new Error('Pinata API key and secret key are required');
      }

      this.pinata = new pinataSDK({ 
        pinataApiKey: this.pinataApiKey, 
        pinataSecretApiKey: this.pinataSecretKey 
      });

      // Test the connection
      await this.pinata.testAuthentication();
      logger.info('✅ Connected to Pinata IPFS service');

      this.isInitialized = true;
      return true;
    } catch (error) {
      logger.error('Failed to initialize Pinata service:', error);
      throw error;
    }
  }

  /**
   * Upload file to IPFS via Pinata
   * @param {string} filePath - Path to file
   * @returns {Promise<string>} IPFS hash (CID)
   */
  async uploadFile(filePath) {
    if (!this.isInitialized) {
      throw new Error('IPFS service not initialized');
    }

    try {
      const readableStreamForFile = fs.createReadStream(filePath);
      const options = {
        pinataMetadata: {
          name: path.basename(filePath)
        }
      };

      const result = await this.pinata.pinFileToIPFS(readableStreamForFile, options);
      logger.info(`File uploaded to IPFS with hash: ${result.IpfsHash}`);
      
      return result.IpfsHash;
    } catch (error) {
      logger.error('Failed to upload file to IPFS:', error);
      throw error;
    }
  }

  /**
   * Download file from IPFS
   * @param {string} cid - IPFS hash (CID)
   * @param {string} outputPath - Path to save file
   * @returns {Promise<void>}
   */
  async downloadFile(cid, outputPath) {
    if (!this.isInitialized) {
      throw new Error('IPFS service not initialized');
    }

    const maxRetries = 5;  // Increased retries
    let lastError = null;
    
    // Ensure output directory exists
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`Downloading from IPFS (attempt ${attempt}/${maxRetries}): ${cid}`);
        logger.debug('IPFS download details:', {
          gateway: this.pinataGateway,
          cid: cid,
          outputPath: outputPath,
          attempt: attempt
        });
        
        // Try Pinata gateway first
        try {
          const url = `${this.pinataGateway}/${cid}`;
          logger.info(`Attempting download from URL: ${url}`);
          const response = await axios.get(url, { 
            responseType: 'arraybuffer',
            timeout: 30000, // 30 second timeout
            headers: {
              'Accept': '*/*',
              'User-Agent': 'AI-Model-Marketplace/1.0'
            }
          });
          
          if (response.status === 200 && response.data) {
            // Write file with detailed error handling
            try {
              await fs.promises.writeFile(outputPath, response.data);
              
              // Verify file was written successfully
              const stats = await fs.promises.stat(outputPath);
              logger.info(`File written successfully. Size: ${stats.size} bytes`);
              
              // Verify file content is valid (not an error page)
              const firstChunk = response.data.slice(0, 1000).toString('utf8');
              if (firstChunk.includes('<!DOCTYPE html>') || firstChunk.includes('<html>')) {
                throw new Error('Downloaded content appears to be HTML/error page instead of model file');
              }
              
              logger.info(`Successfully downloaded file from Pinata: ${cid}`);
              return;
            } catch (writeError) {
              logger.error('Failed to write downloaded file:', writeError);
              throw writeError;
            }
          }
        } catch (pinataError) {
          logger.warn(`Pinata download failed: ${pinataError.message}`);
        }
        
        // Fallback to direct IPFS
        const exists = await this.checkFile(cid);
        if (!exists) {
          throw new Error(`File ${cid} not found on IPFS/Pinata`);
        }

        // Try multiple gateways if Pinata fails
        const gateways = [
          this.pinataGateway,
          'https://cf-ipfs.com/ipfs',  // Cloudflare's dedicated IPFS gateway
          'https://cloudflare-ipfs.com/ipfs',
          'https://gateway.ipfs.io/ipfs',
          'https://ipfs.io/ipfs'
        ];

        // Test gateways first
        logger.info('Testing IPFS gateways...');
        const workingGateways = [];
        for (const gateway of gateways) {
          if (await this.testGateway(gateway)) {
            workingGateways.push(gateway);
            logger.info(`Gateway ${gateway} is accessible ✅`);
          } else {
            logger.warn(`Gateway ${gateway} is not accessible ❌`);
          }
        }

        if (workingGateways.length === 0) {
          throw new Error('No working IPFS gateways found');
        }

        let downloaded = false;
        for (const gateway of gateways) {
          try {
            const response = await axios({
              method: 'get',
              url: `${gateway}/${cid}`,
              responseType: 'stream',
              timeout: 30000 // 30 second timeout
            });

            // Ensure the directory exists
            const dir = path.dirname(outputPath);
            await fs.promises.mkdir(dir, { recursive: true });

            const writer = fs.createWriteStream(outputPath);
            response.data.pipe(writer);

            await new Promise((resolve, reject) => {
              writer.on('finish', resolve);
              writer.on('error', reject);
            });

            // Verify file was created and has content
            const stats = await fs.promises.stat(outputPath);
            if (stats.size === 0) {
              throw new Error('Downloaded file is empty');
            }

            logger.info(`Successfully downloaded ${cid} from ${gateway}`);
            downloaded = true;
            break;
          } catch (gatewayError) {
            logger.warn(`Failed to download from ${gateway}:`, gatewayError.message);
            continue;
          }
        }

        if (!downloaded) {
          throw new Error('All IPFS gateways failed');
        }

        return;
      } catch (error) {
        lastError = error;
        logger.error(`Download attempt ${attempt} failed:`, error.message);
        
        if (attempt < maxRetries) {
          const delay = attempt * 2000; // Exponential backoff
          logger.info(`Retrying in ${delay/1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`Failed to download after ${maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Check gateway health and accessibility
   * @param {string} gateway - Gateway URL to test
   * @returns {Promise<boolean>}
   */
  async testGateway(gateway) {
    try {
      const response = await axios.get(`${gateway}/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG/readme`, {
        timeout: 5000
      });
      return response.status === 200;
    } catch (error) {
      logger.warn(`Gateway ${gateway} health check failed:`, error.message);
      return false;
    }
  }

  /**
   * Check if file exists on IPFS
   * @param {string} cid - IPFS hash (CID)
   * @returns {Promise<boolean>}
   */
  async checkFile(cid) {
    if (!this.isInitialized) {
      throw new Error('IPFS service not initialized');
    }

    try {
      // Query Pinata to check if the file is pinned
      const filters = {
        status: 'pinned',
        ipfs_pin_hash: cid
      };

      const result = await this.pinata.pinList(filters);
      return result.count > 0;
    } catch (error) {
      logger.error('Failed to check file on IPFS:', error);
      return false;
    }
  }

  /**
   * Get IPFS hash of a local file
   * @param {string} filePath - Path to the file
   * @returns {Promise<string>} IPFS hash (CID)
   */
  async getFileHash(filePath, filename = null) {
    if (!this.isInitialized) {
      throw new Error('IPFS service not initialized');
    }

    try {
      const fileStream = fs.createReadStream(filePath);
      const options = {
        pinataMetadata: {
          name: filename || path.basename(filePath)
        }
      };
      const result = await this.pinata.pinFileToIPFS(fileStream, options);
      return result.IpfsHash;
    } catch (error) {
      // If error is about file not existing, try comparing local hash
      if (error.message.includes('filename was not provide')) {
        try {
          // Just check if files are identical by comparing content
          const fileContent = await fs.promises.readFile(filePath);
          const contentHash = require('crypto').createHash('sha256').update(fileContent).digest('hex');
          return contentHash;
        } catch (fallbackError) {
          logger.error('Failed to compute local file hash:', fallbackError);
          throw fallbackError;
        }
      }
      logger.error('Failed to get file hash:', error);
      throw error;
    }
  }

  /**
   * Unpin a file from IPFS
   * @param {string} cid - IPFS hash (CID)
   * @returns {Promise<boolean>}
   */
  async unpinFile(cid) {
    if (!this.isInitialized) {
      throw new Error('IPFS service not initialized');
    }

    try {
      await this.pinata.unpin(cid);
      logger.info(`Successfully unpinned file with hash: ${cid}`);
      return true;
    } catch (error) {
      logger.error('Failed to unpin file from IPFS:', error);
      return false;
    }
  }
}

// Create and export a singleton instance
const ipfsService = new IPFSService();
export default ipfsService;
