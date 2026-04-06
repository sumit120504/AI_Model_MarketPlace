import pinataSDK from '@pinata/sdk';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
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
    this.modelEncryptionEnabled = config.enableModelEncryption !== false;
    this.modelEncryptionKey = this.getModelEncryptionKey();
  }

  getModelEncryptionKey() {
    const configuredKey = config.modelEncryptionKey;

    if (configuredKey) {
      // Accept raw text secret and normalize to 32-byte key
      return crypto.createHash('sha256').update(configuredKey).digest();
    }

    // Backward-compatible fallback so encryption works without extra setup
    if (config.privateKey) {
      return crypto.createHash('sha256').update(`model-encryption:${config.privateKey}`).digest();
    }

    return null;
  }

  encryptBuffer(buffer) {
    if (!this.modelEncryptionKey) {
      throw new Error('Model encryption key is not configured');
    }

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.modelEncryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      version: 'aimm-v1',
      algorithm: 'aes-256-gcm',
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      ciphertext: ciphertext.toString('base64')
    };
  }

  decryptBuffer(envelope) {
    if (!this.modelEncryptionKey) {
      throw new Error('Model encryption key is not configured');
    }

    const iv = Buffer.from(envelope.iv, 'base64');
    const tag = Buffer.from(envelope.tag, 'base64');
    const ciphertext = Buffer.from(envelope.ciphertext, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.modelEncryptionKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  async encryptFileForUpload(filePath) {
    const fileBuffer = await fs.promises.readFile(filePath);
    const envelope = this.encryptBuffer(fileBuffer);

    const tempPath = path.join(os.tmpdir(), `model-encrypted-${Date.now()}-${path.basename(filePath)}.json`);
    await fs.promises.writeFile(tempPath, JSON.stringify(envelope), 'utf8');
    return tempPath;
  }

  async decryptDownloadedFile(inputPath, outputPath) {
    const raw = await fs.promises.readFile(inputPath, 'utf8');

    let envelope;
    try {
      envelope = JSON.parse(raw);
    } catch (error) {
      // Not encrypted JSON payload; keep backward compatibility with old plaintext uploads
      await fs.promises.rename(inputPath, outputPath);
      logger.warn('Model artifact is not encrypted. Using plaintext file for backward compatibility.');
      return;
    }

    const isEncryptedEnvelope = envelope && envelope.version === 'aimm-v1' && envelope.algorithm === 'aes-256-gcm'
      && envelope.iv && envelope.tag && envelope.ciphertext;

    if (!isEncryptedEnvelope) {
      await fs.promises.rename(inputPath, outputPath);
      logger.warn('Model artifact envelope missing encryption metadata. Using plaintext file.');
      return;
    }

    const plaintext = this.decryptBuffer(envelope);
    await fs.promises.writeFile(outputPath, plaintext);
    await fs.promises.unlink(inputPath).catch(() => {});
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
  async uploadFile(filePath, options = {}) {
    if (!this.isInitialized) {
      throw new Error('IPFS service not initialized');
    }

    try {
      const { encrypt = false, artifactType = 'generic' } = options;
      let pinPath = filePath;

      if (encrypt && artifactType === 'model' && this.modelEncryptionEnabled) {
        pinPath = await this.encryptFileForUpload(filePath);
      }

      const readableStreamForFile = fs.createReadStream(pinPath);
      const pinOptions = {
        pinataMetadata: {
          name: path.basename(pinPath)
        }
      };

      const result = await this.pinata.pinFileToIPFS(readableStreamForFile, pinOptions);
      logger.info(`File uploaded to IPFS with hash: ${result.IpfsHash}`);

      if (pinPath !== filePath) {
        await fs.promises.unlink(pinPath).catch(() => {});
      }
      
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
  async downloadFile(cid, outputPath, options = {}) {
    if (!this.isInitialized) {
      throw new Error('IPFS service not initialized');
    }

    const { decrypt = false, artifactType = 'generic' } = options;
    const downloadTargetPath = (decrypt && artifactType === 'model') ? `${outputPath}.encrypted` : outputPath;

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
              await fs.promises.writeFile(downloadTargetPath, response.data);
              
              // Verify file was written successfully
              const stats = await fs.promises.stat(downloadTargetPath);
              logger.info(`File written successfully. Size: ${stats.size} bytes`);
              
              // Verify file content is valid (not an error page)
              const firstChunk = response.data.slice(0, 1000).toString('utf8');
              if (firstChunk.includes('<!DOCTYPE html>') || firstChunk.includes('<html>')) {
                throw new Error('Downloaded content appears to be HTML/error page instead of model file');
              }
              
              if (decrypt && artifactType === 'model') {
                await this.decryptDownloadedFile(downloadTargetPath, outputPath);
                logger.info(`Successfully downloaded and decrypted model file from Pinata: ${cid}`);
              } else {
                logger.info(`Successfully downloaded file from Pinata: ${cid}`);
              }
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

            const writer = fs.createWriteStream(downloadTargetPath);
            response.data.pipe(writer);

            await new Promise((resolve, reject) => {
              writer.on('finish', resolve);
              writer.on('error', reject);
            });

            // Verify file was created and has content
            const stats = await fs.promises.stat(downloadTargetPath);
            if (stats.size === 0) {
              throw new Error('Downloaded file is empty');
            }

            if (decrypt && artifactType === 'model') {
              await this.decryptDownloadedFile(downloadTargetPath, outputPath);
              logger.info(`Successfully downloaded and decrypted ${cid} from ${gateway}`);
            } else {
              logger.info(`Successfully downloaded ${cid} from ${gateway}`);
            }
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
          const contentHash = crypto.createHash('sha256').update(fileContent).digest('hex');
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
