const express = require('express');
const crypto = require('crypto');
const User = require('../models/User');
const ActivationKey = require('../models/ActivationKey');
const Activity = require('../models/Activity');
const { 
  authenticateToken, 
  generateToken, 
  generateRefreshToken, 
  verifyRefreshToken,
  verifyDevice,
  extractSession,
  logRequest
} = require('../middleware/auth');
const { 
  validateActivation, 
  validateLogin,
  handleValidationErrors
} = require('../middleware/validation');

const router = express.Router();

// Apply logging to all auth routes
router.use(logRequest);

/**
 * POST /api/v1/auth/activate
 * Activate device and create user account
 */
router.post('/activate', validateActivation, async (req, res) => {
  try {
    const {
      activationKey,
      userInfo = {},
      deviceId,
      deviceInfo,
      location,
      sessionId
    } = req.body;

    // Normalize key: support 12-digit or dashed formats
    const normalizedKey = String(activationKey).replace(/\D/g, '');

    // Find activation key
    const keyDoc = await ActivationKey.findByKey(normalizedKey);
    if (!keyDoc) {
      return res.status(400).json({
        success: false,
        error: 'Invalid activation key',
        code: 'INVALID_ACTIVATION_KEY'
      });
    }

    // Check if key is valid
    if (!keyDoc.isValid) {
      let reason = 'Unknown';
      if (keyDoc.status === 'used') reason = 'Already used';
      else if (keyDoc.status === 'expired') reason = 'Expired';
      else if (keyDoc.status === 'revoked') reason = 'Revoked';
      else if (keyDoc.isExpired) reason = 'Expired';


      return res.status(400).json({
        success: false,
        error: `Activation key is not valid: ${reason}`,
        code: 'ACTIVATION_KEY_NOT_VALID',
        reason
      });
    }

    // Check if device is already registered
    const existingUserByDevice = await User.findOne({ deviceId });
    if (existingUserByDevice) {
      // If the device is already tied to a pre-created user with the same email, treat this as activation of that account
      if (existingUserByDevice.email?.toLowerCase() !== keyDoc.userDetails.email?.toLowerCase()) {
        return res.status(400).json({
          success: false,
          error: 'Device already registered',
          code: 'DEVICE_ALREADY_REGISTERED'
        });
      }
    }

    // Prepare core user fields (from key assignment, with optional overrides)
    const assigned = keyDoc.userDetails || {};
    const fullName = userInfo.fullName || assigned.fullName || '';
    const firstName = fullName.split(' ')[0] || assigned.fullName?.split(' ')[0] || 'User';
    const lastName = fullName.split(' ').slice(1).join(' ') || firstName;

    const baseUserFields = {
      email: assigned.email,
      firstName,
      lastName,
      role: assigned.role,
      facility: userInfo.facility || assigned.facility,
      state: userInfo.state || assigned.state,
      contactInfo: userInfo.contactInfo,
      deviceId,
      activationKey: normalizedKey,
      activationKeyExpires: keyDoc.expiresAt,
      isActive: true,
      isVerified: true,
      lastLogin: new Date()
    };

    // Add license number for roles that require it
    if (assigned.role === 'doctor' || assigned.role === 'nurse') {
      baseUserFields.licenseNumber = userInfo.licenseNumber || `LIC-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    }

    // Add license number for roles that require it
    if (assigned.role === 'doctor' || assigned.role === 'nurse') {
      baseUserFields.licenseNumber = userInfo.licenseNumber || `LIC-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    }

    // If a user with this email already exists (e.g., pre-created by admin), update that user instead of creating a new one
    let user = await User.findOne({ email: (assigned.email || '').toLowerCase() });

    if (user) {
      // If an existing user was found by device with same email, we will just update it
      user.set({
        ...baseUserFields,
        username: user.username || `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        password: user.password || crypto.randomBytes(32).toString('hex')
      });
      await user.save();
    } else if (existingUserByDevice) {
      // Rare: device found but email lookup failed; still update that device user to avoid duplicates
      existingUserByDevice.set({
        ...baseUserFields,
        username: existingUserByDevice.username || `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        password: existingUserByDevice.password || crypto.randomBytes(32).toString('hex')
      });
      await existingUserByDevice.save();
      user = existingUserByDevice;
    } else {
      // Create new user account
      const userData = {
        username: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        email: (assigned.email || '').toLowerCase(),
        password: crypto.randomBytes(32).toString('hex'), // Random password
        ...baseUserFields
      };
      user = new User(userData);
      await user.save();
    }

    // Mark key as used (online activation)
    try {
      await keyDoc.use();
    } catch (e) {
      console.warn('Failed to mark key as used:', e);
    }

    // Generate tokens
    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    // Log activation activity
    const activity = new Activity({
      userId: user._id,
      deviceId,
      sessionId,
      activityType: 'login',
      action: {
        name: 'device_activation',
        target: 'auth_system',
        value: 'success'
      },
      location,
      deviceInfo,
      timestamp: new Date()
    });
    await activity.save();

    // Calculate remaining days
    const remainingDays = Math.ceil((keyDoc.expiresAt - new Date()) / (1000 * 60 * 60 * 24));

    res.status(201).json({
      success: true,
      message: 'Device activated successfully',
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          facility: user.facility,
          state: user.state,
          contactInfo: user.contactInfo,
          isActive: user.isActive,
          isVerified: user.isVerified
        },
        token,
        refreshToken,
        expiresIn: '24h',
        keyExpiresAt: keyDoc.expiresAt,
        remainingDays: Math.max(0, remainingDays)
      }
    });

  } catch (error) {
    console.error('Activation error:', error);
    res.status(500).json({
      success: false,
      error: 'Device activation failed',
      code: 'ACTIVATION_ERROR'
    });
  }
});

/**
 * POST /api/v1/auth/login
 * Login with activation key for existing users
 */
router.post('/login', validateLogin, async (req, res) => {
  try {
    const { activationKey, deviceId, location, sessionId } = req.body;

    // Normalize key
    const normalizedKey = String(activationKey).replace(/\D/g, '');

    // Find user by activation key
    const user = await User.findOne({
      activationKey: normalizedKey,
      deviceId,
      isActive: true
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Check if user is locked
    if (user.isLocked) {
      return res.status(401).json({
        success: false,
        error: 'Account is locked',
        code: 'ACCOUNT_LOCKED'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.resetLoginAttempts();
    await user.save();

    // Generate tokens
    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    // Log login activity
    const activity = new Activity({
      userId: user._id,
      deviceId,
      sessionId,
      activityType: 'login',
      action: {
        name: 'user_login',
        target: 'auth_system',
        value: 'success'
      },
      location,
      deviceInfo: req.body.deviceInfo,
      timestamp: new Date()
    });
    await activity.save();

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          facility: user.facility,
          state: user.state,
          contactInfo: user.contactInfo,
          isActive: user.isActive,
          isVerified: user.isVerified
        },
        token,
        refreshToken,
        expiresIn: '24h'
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed',
      code: 'LOGIN_ERROR'
    });
  }
});

/**
 * POST /api/v1/auth/logout
 * Logout user and invalidate session
 */
router.post('/logout', authenticateToken, verifyDevice, extractSession, async (req, res) => {
  try {
    const { location } = req.body;

    // Log logout activity
    const activity = new Activity({
      userId: req.user._id,
      deviceId: req.deviceId,
      sessionId: req.sessionId,
      activityType: 'logout',
      action: {
        name: 'user_logout',
        target: 'auth_system',
        value: 'success'
      },
      location,
      deviceInfo: req.body.deviceInfo,
      timestamp: new Date()
    });
    await activity.save();

    res.json({
      success: true,
      message: 'Logout successful'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Logout failed',
      code: 'LOGOUT_ERROR'
    });
  }
});

/**
 * GET /api/v1/auth/verify
 * Verify JWT token and return user info
 */
router.get('/verify', authenticateToken, async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Token is valid',
      data: {
        user: {
          id: req.user._id,
          username: req.user.username,
          email: req.user.email,
          firstName: req.user.firstName,
          lastName: req.user.lastName,
          role: req.user.role,
          facility: req.user.facility,
          state: req.user.state,
          contactInfo: req.user.contactInfo,
          isActive: req.user.isActive,
          isVerified: req.user.isVerified,
          lastLogin: req.user.lastLogin
        }
      }
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Token verification failed',
      code: 'TOKEN_VERIFICATION_ERROR'
    });
  }
});

/**
 * POST /api/v1/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token required',
        code: 'REFRESH_TOKEN_MISSING'
      });
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);
    
    // Find user
    const user = await User.findById(decoded.userId).select('-password');
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Invalid refresh token',
        code: 'INVALID_REFRESH_TOKEN'
      });
    }

    // Generate new access token
    const newToken = generateToken(user);

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        token: newToken,
        expiresIn: '24h'
      }
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({
      success: false,
      error: 'Token refresh failed',
      code: 'TOKEN_REFRESH_ERROR'
    });
  }
});

module.exports = router;
