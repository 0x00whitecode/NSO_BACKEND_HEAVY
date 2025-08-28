const jwt = require('jsonwebtoken');
const User = require('../models/User');
const config = require('../config');

/**
 * Middleware to verify JWT token and authenticate user
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token required',
        code: 'TOKEN_MISSING'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, config.JWT_SECRET);
    
    // Find user
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'User account is deactivated',
        code: 'USER_DEACTIVATED'
      });
    }

    // Check if user is locked
    if (user.isLocked) {
      return res.status(401).json({
        success: false,
        error: 'User account is locked',
        code: 'USER_LOCKED'
      });
    }

    // Add user to request object
    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
        code: 'TOKEN_INVALID'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }

    console.error('Authentication error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
};

/**
 * Middleware to check if user has required role
 */
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const userRole = req.user.role;
    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS',
        required: allowedRoles,
        current: userRole
      });
    }

    next();
  };
};

/**
 * Middleware to check if user is admin
 */
const requireAdmin = requireRole(['admin']);

/**
 * Middleware to check if user is medical professional
 */
const requireMedical = requireRole(['doctor', 'nurse']);

/**
 * Middleware to check if user is supervisor or admin
 */
const requireSupervisor = requireRole(['admin', 'supervisor']);

/**
 * Middleware to verify device ID matches user's registered device
 */
const verifyDevice = (req, res, next) => {
  try {
    const deviceId = req.headers['x-device-id'] || req.body.deviceId;
    
    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: 'Device ID required',
        code: 'DEVICE_ID_MISSING'
      });
    }

    if (req.user && req.user.deviceId && req.user.deviceId !== deviceId) {
      return res.status(403).json({
        success: false,
        error: 'Device not authorized',
        code: 'DEVICE_NOT_AUTHORIZED'
      });
    }

    req.deviceId = deviceId;
    next();
  } catch (error) {
    console.error('Device verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Device verification failed',
      code: 'DEVICE_VERIFICATION_ERROR'
    });
  }
};

/**
 * Middleware to extract and validate session ID
 */
const extractSession = (req, res, next) => {
  try {
    const sessionId = req.headers['x-session-id'] || req.body.sessionId;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID required',
        code: 'SESSION_ID_MISSING'
      });
    }

    req.sessionId = sessionId;
    next();
  } catch (error) {
    console.error('Session extraction error:', error);
    res.status(500).json({
      success: false,
      error: 'Session extraction failed',
      code: 'SESSION_EXTRACTION_ERROR'
    });
  }
};

/**
 * Middleware to log API requests
 */
const logRequest = (req, res, next) => {
  const start = Date.now();
  
  // Log request
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl} - User: ${req.user?.username || 'Anonymous'} - Device: ${req.deviceId || 'Unknown'}`);
  
  // Override res.json to log response
  const originalJson = res.json;
  res.json = function(data) {
    const duration = Date.now() - start;
    console.log(`${new Date().toISOString()} - Response: ${res.statusCode} - Duration: ${duration}ms`);
    return originalJson.call(this, data);
  };
  
  next();
};

/**
 * Generate JWT token for user
 */
const generateToken = (user) => {
  const payload = {
    userId: user._id,
    username: user.username,
    role: user.role,
    deviceId: user.deviceId
  };

  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN || '24h',
    issuer: 'nso-backend',
    audience: 'nso-mobile-app'
  });
};

/**
 * Generate refresh token for user
 */
const generateRefreshToken = (user) => {
  const payload = {
    userId: user._id,
    type: 'refresh'
  };

  return jwt.sign(payload, config.JWT_REFRESH_SECRET || config.JWT_SECRET, {
    expiresIn: '7d',
    issuer: 'nso-backend',
    audience: 'nso-mobile-app'
  });
};

/**
 * Verify refresh token
 */
const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, config.JWT_REFRESH_SECRET || config.JWT_SECRET);
  } catch (error) {
    throw error;
  }
};

module.exports = {
  authenticateToken,
  requireRole,
  requireAdmin,
  requireMedical,
  requireSupervisor,
  verifyDevice,
  extractSession,
  logRequest,
  generateToken,
  generateRefreshToken,
  verifyRefreshToken
};
