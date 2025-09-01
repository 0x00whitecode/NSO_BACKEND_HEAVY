const crypto = require('crypto');
const ActivationKey = require('../models/ActivationKey');

/**
 * Service for managing 12-digit activation keys with offline validation
 */
class ActivationKeyService {
  
  /**
   * Generate a new 12-digit activation key with user details
   * @param {Object} userDetails - User details to attach to the key
   * @param {Object} options - Additional options (expiresAt, notes, createdBy)
   * @returns {Promise<Object>} Generated activation key data
   */
  async generateKey(userDetails, options = {}) {
    try {
      // Validate required user details
      const requiredFields = ['fullName', 'email', 'role'];
      for (const field of requiredFields) {
        if (!userDetails[field]) {
          throw new Error(`${field} is required`);
        }
      }

      // Generate unique 12-digit key
      let key;
      let isUnique = false;
      let attempts = 0;
      const maxAttempts = 10;

      while (!isUnique && attempts < maxAttempts) {
        key = this.generateUniqueKey();
        const existing = await ActivationKey.findByKey(key);
        if (!existing) {
          isUnique = true;
        }
        attempts++;
      }

      if (!isUnique) {
        throw new Error('Failed to generate unique activation key');
      }

      // Prepare user data for encryption
      const userData = {
        fullName: userDetails.fullName,
        email: userDetails.email,
        phone: userDetails.phone || '',
        role: userDetails.role,
        facility: userDetails.facility || '',
        state: userDetails.state || '',
        generatedAt: new Date().toISOString(),
        keyId: key
      };

      // Encrypt user data for offline validation
      const encryptedUserData = ActivationKey.encryptUserData(userData, key);

      // Set expiration date (default: 30 days from now)
      const expiresAt = options.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // Create activation key record
      const activationKey = new ActivationKey({
        key,
        encryptedUserData,
        userDetails: {
          fullName: userDetails.fullName,
          email: userDetails.email,
          phone: userDetails.phone || '',
          role: userDetails.role,
          facility: userDetails.facility || '',
          state: userDetails.state || ''
        },
        expiresAt,
        createdBy: options.createdBy,
        notes: options.notes || ''
      });

      await activationKey.save();

      return {
        success: true,
        data: {
          key: activationKey.key,
          userDetails: activationKey.userDetails,
          status: activationKey.status,
          expiresAt: activationKey.expiresAt,
          createdAt: activationKey.createdAt,
          remainingDays: activationKey.getRemainingDays()
        }
      };

    } catch (error) {
      console.error('Error generating activation key:', error);
      return {
        success: false,
        error: error.message || 'Failed to generate activation key'
      };
    }
  }

  /**
   * Generate a unique 12-digit numeric key
   * @returns {string} 12-digit key
   */
  generateUniqueKey() {
    let key = '';
    for (let i = 0; i < 12; i++) {
      key += Math.floor(Math.random() * 10).toString();
    }
    return key;
  }

  /**
   * Validate activation key for mobile app
   * @param {string} key - 12-digit activation key
   * @returns {Promise<Object>} Validation result with user data
   */
  async validateKey(key) {
    try {
      // Find key in database
      const activationKey = await ActivationKey.findByKey(key);
      
      if (!activationKey) {
        return {
          success: false,
          error: 'Invalid activation key',
          code: 'INVALID_KEY'
        };
      }

      // Check if key can be used
      if (!activationKey.canUse()) {
        let reason = 'Unknown';
        if (activationKey.status === 'used') reason = 'Already used';
        else if (activationKey.status === 'expired') reason = 'Expired';
        else if (activationKey.status === 'revoked') reason = 'Revoked';
        else if (activationKey.isExpired) reason = 'Expired';

        return {
          success: false,
          error: `Activation key cannot be used: ${reason}`,
          code: 'KEY_UNUSABLE',
          reason
        };
      }

      // Decrypt user data for offline validation
      const userData = ActivationKey.decryptUserData(activationKey.encryptedUserData, key);
      
      if (!userData) {
        return {
          success: false,
          error: 'Failed to decrypt activation key data',
          code: 'DECRYPTION_FAILED'
        };
      }

      return {
        success: true,
        data: {
          userData,
          keyDetails: {
            expiresAt: activationKey.expiresAt,
            remainingDays: activationKey.getRemainingDays(),
            status: activationKey.status
          }
        }
      };

    } catch (error) {
      console.error('Error validating activation key:', error);
      return {
        success: false,
        error: 'Activation key validation failed',
        code: 'VALIDATION_ERROR'
      };
    }
  }

  /**
   * Use/activate a key (mark as used)
   * @param {string} key - 12-digit activation key
   * @returns {Promise<Object>} Result of key usage
   */
  async useKey(key) {
    try {
      const activationKey = await ActivationKey.findByKey(key);
      
      if (!activationKey) {
        return {
          success: false,
          error: 'Invalid activation key',
          code: 'INVALID_KEY'
        };
      }

      if (!activationKey.canUse()) {
        return {
          success: false,
          error: 'Activation key cannot be used',
          code: 'KEY_UNUSABLE'
        };
      }

      await activationKey.use();

      return {
        success: true,
        message: 'Activation key used successfully'
      };

    } catch (error) {
      console.error('Error using activation key:', error);
      return {
        success: false,
        error: 'Failed to use activation key'
      };
    }
  }

  /**
   * Get all activation keys with filtering and pagination
   * @param {Object} filters - Filter options
   * @param {Object} pagination - Pagination options
   * @returns {Promise<Object>} List of activation keys
   */
  async getKeys(filters = {}, pagination = {}) {
    try {
      const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = pagination;
      const skip = (page - 1) * limit;

      // Build query
      const query = {};
      if (filters.status) query.status = filters.status;
      if (filters.role) query['userDetails.role'] = filters.role;
      if (filters.email) query['userDetails.email'] = new RegExp(filters.email, 'i');
      if (filters.createdBy) query.createdBy = filters.createdBy;

      // Execute query
      const keys = await ActivationKey.find(query)
        .populate('createdBy', 'username email')
        .populate('revokedBy', 'username email')
        .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
        .skip(skip)
        .limit(limit);

      const total = await ActivationKey.countDocuments(query);

      return {
        success: true,
        data: {
          keys,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
          }
        }
      };

    } catch (error) {
      console.error('Error getting activation keys:', error);
      return {
        success: false,
        error: 'Failed to retrieve activation keys'
      };
    }
  }

  /**
   * Revoke an activation key
   * @param {string} key - 12-digit activation key
   * @param {string} revokedBy - User ID who revoked the key
   * @param {string} reason - Reason for revocation
   * @returns {Promise<Object>} Revocation result
   */
  async revokeKey(key, revokedBy, reason) {
    try {
      const activationKey = await ActivationKey.findByKey(key);
      
      if (!activationKey) {
        return {
          success: false,
          error: 'Invalid activation key',
          code: 'INVALID_KEY'
        };
      }

      if (activationKey.status === 'revoked') {
        return {
          success: false,
          error: 'Activation key is already revoked',
          code: 'ALREADY_REVOKED'
        };
      }

      await activationKey.revoke(revokedBy, reason);

      return {
        success: true,
        message: 'Activation key revoked successfully'
      };

    } catch (error) {
      console.error('Error revoking activation key:', error);
      return {
        success: false,
        error: 'Failed to revoke activation key'
      };
    }
  }
}

module.exports = new ActivationKeyService();
