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

    try {
      const response = await axios({
        method: 'get',
        url: `${this.pinataGateway}/${cid}`,
        responseType: 'stream'
      });

      const writer = fs.createWriteStream(outputPath);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
    } catch (error) {
      logger.error('Failed to download file from IPFS:', error);
      throw error;
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