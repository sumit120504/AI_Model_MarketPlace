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

    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`Downloading from IPFS (attempt ${attempt}/${maxRetries}): ${cid}`);
        
        // First verify the file exists
        const exists = await this.checkFile(cid);
        if (!exists) {
          throw new Error(`File ${cid} not found on IPFS/Pinata`);
        }

        // Try multiple gateways if Pinata fails
        const gateways = [
          this.pinataGateway,
          'https://ipfs.io/ipfs',
          'https://cloudflare-ipfs.com/ipfs'
        ];

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
