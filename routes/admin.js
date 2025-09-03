const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const ActivationKey = require('../models/ActivationKey');
const Activity = require('../models/Activity');
const Diagnosis = require('../models/Diagnosis');
const SyncLog = require('../models/SyncLog');
const { 
  authenticateToken, 
  requireAdmin,
  requireSupervisor,
  logRequest
} = require('../middleware/auth');
const { 
  validateActivationKeyCreation,
  validatePagination,
  validateDateRange,
  validateObjectId
} = require('../middleware/validation');

const router = express.Router();

// Apply middleware to all admin routes
router.use(logRequest);

// Simple admin authentication middleware - just check for admin in the request
const simpleAdminAuth = (req, res, next) => {
  // For demo purposes, allow admin access without complex authentication
  // In production, you'd have proper admin authentication
  const mongoose = require('mongoose');
  req.user = {
    _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'), // Valid ObjectId for admin
    role: 'admin',
    email: 'admin@nso.gov.ng',
    firstName: 'Admin',
    lastName: 'User'
  };
  next();
};

// Apply simple admin auth to all admin routes
router.use(simpleAdminAuth);

/**
 * GET /api/v1/admin/dashboard/stats
 * Get dashboard statistics for admin panel
 */
router.get('/dashboard/stats', validateDateRange, async (req, res) => {
  try {
    const {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      endDate = new Date()
    } = req.query;

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Get user statistics
    const totalUsers = await User.countDocuments({ isActive: true });
    const newUsers = await User.countDocuments({
      createdAt: { $gte: start, $lte: end }
    });
    const activeUsers = await Activity.distinct('userId', {
      timestamp: { $gte: start, $lte: end }
    });

    // Get activation key statistics
    const totalKeys = await ActivationKey.countDocuments();
    const activeKeys = await ActivationKey.countDocuments({ status: 'active' });
    const usedKeys = await ActivationKey.countDocuments({ status: 'used' });
    const expiredKeys = await ActivationKey.countDocuments({ status: 'expired' });

    // Get activity statistics
    const totalActivities = await Activity.countDocuments({
      timestamp: { $gte: start, $lte: end }
    });
    const errorActivities = await Activity.countDocuments({
      activityType: 'error',
      timestamp: { $gte: start, $lte: end }
    });

    // Get diagnosis statistics
    const totalDiagnoses = await Diagnosis.countDocuments({
      createdAt: { $gte: start, $lte: end }
    });
    const completedDiagnoses = await Diagnosis.countDocuments({
      status: 'completed',
      createdAt: { $gte: start, $lte: end }
    });

    // Get sync statistics
    const totalSyncs = await SyncLog.countDocuments({
      startedAt: { $gte: start, $lte: end }
    });
    const failedSyncs = await SyncLog.countDocuments({
      status: 'failed',
      startedAt: { $gte: start, $lte: end }
    });

    // Get user role breakdown
    const userRoles = await User.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);

    // Get top error codes
    const topErrors = await Activity.aggregate([
      {
        $match: {
          activityType: 'error',
          timestamp: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: '$error.code',
          count: { $sum: 1 },
          severity: { $first: '$error.severity' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      success: true,
      data: {
        period: { startDate: start, endDate: end },
        users: {
          total: totalUsers,
          new: newUsers,
          active: activeUsers.length,
          roleBreakdown: userRoles.reduce((acc, role) => {
            acc[role._id] = role.count;
            return acc;
          }, {})
        },
        activationKeys: {
          total: totalKeys,
          active: activeKeys,
          used: usedKeys,
          expired: expiredKeys
        },
        activities: {
          total: totalActivities,
          errors: errorActivities,
          errorRate: totalActivities > 0 ? (errorActivities / totalActivities * 100).toFixed(2) : 0
        },
        diagnoses: {
          total: totalDiagnoses,
          completed: completedDiagnoses,
          completionRate: totalDiagnoses > 0 ? (completedDiagnoses / totalDiagnoses * 100).toFixed(2) : 0
        },
        sync: {
          total: totalSyncs,
          failed: failedSyncs,
          successRate: totalSyncs > 0 ? ((totalSyncs - failedSyncs) / totalSyncs * 100).toFixed(2) : 0
        },
        topErrors
      }
    });

  } catch (error) {
    console.error('Get admin dashboard stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve dashboard statistics',
      code: 'GET_ADMIN_DASHBOARD_STATS_ERROR'
    });
  }
});

/**
 * GET /api/v1/admin/users
 * Get all users with pagination and filtering
 */
router.get('/users', validatePagination, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      role,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    const query = {};
    
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
        { facility: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (role) query.role = role;
    if (status === 'active') query.isActive = true;
    if (status === 'inactive') query.isActive = false;

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const users = await User.find(query)
      .select('-password -activationKey')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const total = await User.countDocuments(query);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get admin users error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve users',
      code: 'GET_ADMIN_USERS_ERROR'
    });
  }
});

/**
 * GET /api/v1/admin/users/:userId
 * Get detailed user information
 */
router.get('/users/:userId', validateObjectId('userId'), async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .select('-password')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Get user's recent activities
    const recentActivities = await Activity.find({ userId })
      .sort({ timestamp: -1 })
      .limit(10)
      .select('activityType timestamp screenName error')
      .lean();

    // Get user's diagnosis count
    const diagnosisCount = await Diagnosis.countDocuments({ userId });

    // Get user's sync statistics
    const syncStats = await SyncLog.aggregate([
      { $match: { userId: user._id } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        user,
        statistics: {
          diagnosisCount,
          recentActivities,
          syncStats: syncStats.reduce((acc, stat) => {
            acc[stat._id] = stat.count;
            return acc;
          }, {})
        }
      }
    });

  } catch (error) {
    console.error('Get admin user details error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve user details',
      code: 'GET_ADMIN_USER_DETAILS_ERROR'
    });
  }
});

/**
 * POST /api/v1/admin/users
 * Create new user and activation key
 */
router.post('/users', async (req, res) => {
  try {
    const {
      fullName,
      email,
      role,
      facility,
      state,
      contactInfo,
      deviceId,
      validityMonths = 12,
      notes
    } = req.body;

    // Validate required fields
    if (!fullName || !email || !role || !facility || !state || !deviceId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: fullName, email, role, facility, state, deviceId',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format',
        code: 'INVALID_EMAIL'
      });
    }

    // Validate role
    const validRoles = ['doctor', 'nurse', 'admin', 'technician', 'inspector', 'supervisor'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role. Must be one of: ' + validRoles.join(', '),
        code: 'INVALID_ROLE'
      });
    }

    // Check if user with email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'User with this email already exists',
        code: 'EMAIL_EXISTS'
      });
    }

    // Check if device ID is already in use
    const existingDevice = await User.findOne({ deviceId });
    if (existingDevice) {
      return res.status(400).json({
        success: false,
        error: 'Device ID is already in use',
        code: 'DEVICE_EXISTS'
      });
    }

    // Generate license number for doctors and nurses
    const licenseNumber = (role === 'doctor' || role === 'nurse')
      ? `${role.toUpperCase()}-${state.toUpperCase()}-${Date.now().toString().slice(-6)}`
      : undefined;

    // Create user account (without activation key initially)
    const user = new User({
      username: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      email: email.toLowerCase(),
      password: crypto.randomBytes(32).toString('hex'), // Random password
      firstName: fullName.split(' ')[0],
      lastName: fullName.split(' ').slice(1).join(' ') || fullName.split(' ')[0],
      role,
      facility,
      state,
      contactInfo,
      deviceId,
      licenseNumber,
      isActive: false, // User needs activation key to become active
      isVerified: false // User needs to activate first
    });

    await user.save();

    // Now create activation key automatically
    const { generateActivationKey } = require('../scripts/generate-offline-keys');

    // Calculate expiry date
    const validUntil = new Date();
    validUntil.setMonth(validUntil.getMonth() + validityMonths);

    // Generate offline activation key with encrypted user data
    const keyData = {
      userId: user._id.toString(),
      fullName,
      role,
      facility,
      state,
      contactInfo: email,
      validUntil,
      maxUses: 1,
      usageCount: 0,
      status: 'active',
      createdAt: new Date(),
      assignedBy: req.user?.email || 'admin@nso.gov.ng'
    };

    const offlineKey = generateActivationKey(keyData);

    if (!offlineKey) {
      // If key generation fails, delete the user and return error
      await User.findByIdAndDelete(user._id);
      return res.status(500).json({
        success: false,
        error: 'Failed to generate activation key',
        code: 'ACTIVATION_KEY_GENERATION_FAILED'
      });
    }

    const key = offlineKey.key;

    // Create activation key record
    const activationKey = new ActivationKey({
      key,
      keyHash: crypto.createHash('sha256').update(key).digest('hex'),
      assignedTo: {
        email: email.toLowerCase(),
        fullName,
        role,
        facility,
        state,
        contactInfo: email
      },
      validUntil,
      maxUses: 1,
      notes,
      createdBy: req.user?._id,
      status: 'active'
    });

    await activationKey.save();

    // Update user with activation key reference
    user.activationKey = key;
    await user.save();

    // Add creation to usage history
    await activationKey.addUsageHistory(
      'created',
      req.user?._id,
      null,
      req.ip,
      null,
      { notes, autoGenerated: true }
    );

    res.status(201).json({
      success: true,
      message: 'User and activation key created successfully',
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
          deviceId: user.deviceId,
          isActive: user.isActive,
          isVerified: user.isVerified,
          createdAt: user.createdAt
        },
        activationKey: {
          id: activationKey._id,
          key: activationKey.key,
          assignedTo: activationKey.assignedTo,
          validUntil: activationKey.validUntil,
          status: activationKey.status,
          createdAt: activationKey.createdAt,
          isOfflineKey: true,
          encryptedData: offlineKey.encryptedData
        }
      }
    });

  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create user',
      code: 'CREATE_USER_ERROR'
    });
  }
});

/**
 * PUT /api/v1/admin/users/:userId/status
 * Update user status (activate/deactivate)
 */
router.put('/users/:userId/status', validateObjectId('userId'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { isActive, reason } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'isActive must be a boolean',
        code: 'INVALID_STATUS'
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      {
        isActive,
        $push: {
          'metadata.statusHistory': {
            status: isActive ? 'activated' : 'deactivated',
            reason: reason || 'Admin action',
            timestamp: new Date(),
            adminId: req.user._id
          }
        }
      },
      { new: true }
    ).select('-password -activationKey');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: { user }
    });

  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user status',
      code: 'UPDATE_USER_STATUS_ERROR'
    });
  }
});

/**
 * DELETE /api/v1/admin/users/:userId
 * Delete user and associated activation key
 */
router.delete('/users/:userId', validateObjectId('userId'), async (req, res) => {
  try {
    const { userId } = req.params;

    // Find user first to get activation key info
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Delete associated activation key if exists
    if (user.activationKey) {
      await ActivationKey.findOneAndDelete({ key: user.activationKey });
    }

    // Delete user
    await User.findByIdAndDelete(userId);

    // Log the deletion activity
    await Activity.create({
      userId: req.user._id,
      activityType: 'admin_action',
      action: 'delete_user',
      details: `Deleted user: ${user.email} (${user.firstName} ${user.lastName})`,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      severity: 'high'
    });

    res.json({
      success: true,
      message: 'User deleted successfully',
      data: { deletedUserId: userId }
    });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete user',
      code: 'DELETE_USER_ERROR'
    });
  }
});

/**
 * GET /api/v1/admin/activation-keys
 * Get activation keys with pagination and filtering
 */
router.get('/activation-keys', validatePagination, (req, res, next) => {
  // Delegate to the service-based implementation defined later for consistency
  return next();
});

/**
 * POST /api/v1/admin/activation-keys
 * Create new 12-digit activation key
 */
router.post('/activation-keys', async (req, res) => {
  try {
    const {
      userDetails,
      expiresAt,
      notes
    } = req.body;

    // Validate required fields
    if (!userDetails || !userDetails.fullName || !userDetails.email || !userDetails.role) {
      return res.status(400).json({
        success: false,
        error: 'User details (fullName, email, role) are required',
        code: 'MISSING_USER_DETAILS'
      });
    }

    // Import the new activation key service
    const activationKeyService = require('../services/activationKeyService');

    // Generate new 12-digit activation key
    const result = await activationKeyService.generateKey(userDetails, {
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      notes,
      createdBy: req.user._id
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error,
        code: 'KEY_GENERATION_FAILED'
      });
    }

    res.status(201).json({
      success: true,
      message: '12-digit activation key created successfully',
      data: {
        activationKey: result.data
      }
    });

  } catch (error) {
    console.error('Create activation key error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create activation key',
      code: 'CREATE_ACTIVATION_KEY_ERROR'
    });
  }
});

/**
 * GET /api/v1/admin/activation-keys
 * Get all activation keys with filtering and pagination
 */
router.get('/activation-keys', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      role,
      email,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const activationKeyService = require('../services/activationKeyService');

    const result = await activationKeyService.getKeys(
      { status, role, email, createdBy: req.user._id },
      { page: parseInt(page), limit: parseInt(limit), sortBy, sortOrder }
    );

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error,
        code: 'GET_KEYS_FAILED'
      });
    }

    res.json({
      success: true,
      message: 'Activation keys retrieved successfully',
      data: result.data
    });

  } catch (error) {
    console.error('Get activation keys error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve activation keys',
      code: 'GET_ACTIVATION_KEYS_ERROR'
    });
  }
});

/**
 * POST /api/v1/admin/activation-keys/:key/revoke
 * Revoke an activation key
 */
router.post('/activation-keys/:key/revoke', async (req, res) => {
  try {
    const { key } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        error: 'Revocation reason is required',
        code: 'MISSING_REASON'
      });
    }

    const activationKeyService = require('../services/activationKeyService');

    const result = await activationKeyService.revokeKey(key, req.user._id, reason);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        code: result.code || 'REVOKE_FAILED'
      });
    }

    res.json({
      success: true,
      message: 'Activation key revoked successfully'
    });

  } catch (error) {
    console.error('Revoke activation key error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to revoke activation key',
      code: 'REVOKE_ACTIVATION_KEY_ERROR'
    });
  }
});

/**
 * POST /api/v1/admin/activation-keys/:keyId/revoke
 * Revoke an activation key
 */
router.post('/activation-keys/:keyId/revoke', validateObjectId('keyId'), async (req, res) => {
  try {
    const { keyId } = req.params;
    const { reason } = req.body;

    const activationKey = await ActivationKey.findById(keyId);
    if (!activationKey) {
      return res.status(404).json({
        success: false,
        error: 'Activation key not found',
        code: 'ACTIVATION_KEY_NOT_FOUND'
      });
    }

    if (activationKey.status === 'revoked') {
      return res.status(400).json({
        success: false,
        error: 'Activation key is already revoked',
        code: 'ALREADY_REVOKED'
      });
    }

    await activationKey.revoke(req.user._id, reason || 'Admin revocation');

    res.json({
      success: true,
      message: 'Activation key revoked successfully',
      data: {
        keyId: activationKey._id,
        revokedAt: activationKey.revokedAt,
        reason: activationKey.revocationReason
      }
    });

  } catch (error) {
    console.error('Revoke activation key error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to revoke activation key',
      code: 'REVOKE_ACTIVATION_KEY_ERROR'
    });
  }
});

/**
 * GET /api/v1/admin/analytics/errors
 * Get error analytics
 */
router.get('/analytics/errors', validateDateRange, async (req, res) => {
  try {
    const {
      startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      endDate = new Date()
    } = req.query;

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Get error statistics
    const errorStats = await Activity.aggregate([
      {
        $match: {
          activityType: 'error',
          timestamp: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: '$error.severity',
          count: { $sum: 1 }
        }
      }
    ]);

    // Transform error stats into expected format
    const errorStatsFormatted = {
      total: 0,
      critical: 0,
      warning: 0,
      info: 0
    };

    errorStats.forEach(stat => {
      const severity = stat._id || 'info';
      errorStatsFormatted[severity] = stat.count;
      errorStatsFormatted.total += stat.count;
    });

    // Get error trends by day
    const errorTrends = await Activity.aggregate([
      {
        $match: {
          activityType: 'error',
          timestamp: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$timestamp' },
            month: { $month: '$timestamp' },
            day: { $dayOfMonth: '$timestamp' }
          },
          count: { $sum: 1 },
          criticalCount: {
            $sum: {
              $cond: [{ $eq: ['$error.severity', 'critical'] }, 1, 0]
            }
          }
        }
      },
      {
        $project: {
          date: {
            $dateFromParts: {
              year: '$_id.year',
              month: '$_id.month',
              day: '$_id.day'
            }
          },
          count: 1,
          criticalCount: 1
        }
      },
      { $sort: { date: 1 } }
    ]);

    res.json({
      success: true,
      data: {
        period: { startDate: start, endDate: end },
        errorStats: errorStatsFormatted,
        errorTrends
      }
    });

  } catch (error) {
    console.error('Get error analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve error analytics',
      code: 'GET_ERROR_ANALYTICS_ERROR'
    });
  }
});

/**
 * GET /api/v1/admin/analytics/usage
 * Get usage analytics
 */
router.get('/analytics/usage', validateDateRange, async (req, res) => {
  try {
    const {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      endDate = new Date()
    } = req.query;

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Get daily active users
    const dailyActiveUsers = await Activity.aggregate([
      {
        $match: {
          timestamp: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$timestamp' },
            month: { $month: '$timestamp' },
            day: { $dayOfMonth: '$timestamp' }
          },
          users: { $addToSet: '$userId' }
        }
      },
      {
        $project: {
          date: {
            $dateFromParts: {
              year: '$_id.year',
              month: '$_id.month',
              day: '$_id.day'
            }
          },
          userCount: { $size: '$users' }
        }
      },
      { $sort: { date: 1 } }
    ]);

    // Get feature usage
    const featureUsage = await Activity.aggregate([
      {
        $match: {
          timestamp: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: '$activityType',
          count: { $sum: 1 },
          uniqueUsers: { $addToSet: '$userId' }
        }
      },
      {
        $project: {
          activityType: '$_id',
          count: 1,
          uniqueUsers: { $size: '$uniqueUsers' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Get geographic distribution
    const geographicDistribution = await Activity.aggregate([
      {
        $match: {
          timestamp: { $gte: start, $lte: end },
          'location.facility': { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: '$location.facility',
          userCount: { $addToSet: '$userId' },
          activityCount: { $sum: 1 }
        }
      },
      {
        $project: {
          facility: '$_id',
          userCount: { $size: '$userCount' },
          activityCount: 1
        }
      },
      { $sort: { userCount: -1 } },
      { $limit: 10 }
    ]);

    // Get device distribution (mock data for now)
    const deviceDistribution = [
      { deviceType: 'Android', userCount: Math.floor(Math.random() * 1000) + 500 },
      { deviceType: 'iOS', userCount: Math.floor(Math.random() * 500) + 200 },
      { deviceType: 'Web', userCount: Math.floor(Math.random() * 200) + 100 }
    ];

    res.json({
      success: true,
      data: {
        period: { startDate: start, endDate: end },
        dailyActiveUsers,
        featureUsage,
        geographicDistribution,
        deviceDistribution
      }
    });

  } catch (error) {
    console.error('Get usage analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve usage analytics',
      code: 'GET_USAGE_ANALYTICS_ERROR'
    });
  }
});

/**
 * GET /api/v1/admin/analytics/geographic
 * Get geographic analytics
 */
router.get('/analytics/geographic', validateDateRange, async (req, res) => {
  try {
    const {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate = new Date()
    } = req.query;

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Get user distribution by state
    const stateDistribution = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          state: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: '$state',
          userCount: { $sum: 1 }
        }
      },
      {
        $project: {
          state: '$_id',
          userCount: 1
        }
      },
      { $sort: { userCount: -1 } }
    ]);

    // Get facility distribution
    const facilityDistribution = await Activity.aggregate([
      {
        $match: {
          timestamp: { $gte: start, $lte: end },
          'location.facility': { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: '$location.facility',
          userCount: { $addToSet: '$userId' },
          activityCount: { $sum: 1 }
        }
      },
      {
        $project: {
          facility: '$_id',
          userCount: { $size: '$userCount' },
          activityCount: 1
        }
      },
      { $sort: { userCount: -1 } },
      { $limit: 20 }
    ]);

    res.json({
      success: true,
      data: {
        period: { startDate: start, endDate: end },
        stateDistribution,
        facilityDistribution
      }
    });

  } catch (error) {
    console.error('Get geographic analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve geographic analytics',
      code: 'GET_GEOGRAPHIC_ANALYTICS_ERROR'
    });
  }
});

/**
 * GET /api/v1/admin/analytics/performance
 * Get performance analytics
 */
router.get('/analytics/performance', validateDateRange, async (req, res) => {
  try {
    const {
      startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      endDate = new Date()
    } = req.query;

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Get performance metrics
    const performanceMetrics = await Activity.aggregate([
      {
        $match: {
          activityType: 'performance',
          timestamp: { $gte: start, $lte: end },
          'performance.duration': { $exists: true }
        }
      },
      {
        $group: {
          _id: '$screenName',
          avgDuration: { $avg: '$performance.duration' },
          avgLoadTime: { $avg: '$performance.loadTime' },
          avgMemoryUsage: { $avg: '$performance.memoryUsage' },
          avgNetworkLatency: { $avg: '$performance.networkLatency' },
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          screenName: '$_id',
          avgDuration: { $round: ['$avgDuration', 2] },
          avgLoadTime: { $round: ['$avgLoadTime', 2] },
          avgMemoryUsage: { $round: ['$avgMemoryUsage', 2] },
          avgNetworkLatency: { $round: ['$avgNetworkLatency', 2] },
          count: 1
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Get sync performance
    const syncPerformance = await SyncLog.aggregate([
      {
        $match: {
          startedAt: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: '$syncType',
          avgDuration: { $avg: '$duration' },
          successRate: {
            $avg: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          syncType: '$_id',
          avgDuration: { $round: ['$avgDuration', 2] },
          successRate: { $round: [{ $multiply: ['$successRate', 100] }, 2] },
          count: 1
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        period: { startDate: start, endDate: end },
        performanceMetrics,
        syncPerformance
      }
    });

  } catch (error) {
    console.error('Get performance analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve performance analytics',
      code: 'GET_PERFORMANCE_ANALYTICS_ERROR'
    });
  }
});

/**
 * GET /api/v1/admin/activity-logs
 * Get activity logs with pagination and filtering
 */
router.get('/activity-logs', validatePagination, validateDateRange, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      userId,
      activityType,
      severity,
      search,
      startDate,
      endDate,
      sortBy = 'timestamp',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    const query = {};

    if (userId) query.userId = userId;
    if (activityType) query.activityType = activityType;
    if (severity) query['error.severity'] = severity;

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    if (search) {
      query.$or = [
        { 'action.name': { $regex: search, $options: 'i' } },
        { 'screen.name': { $regex: search, $options: 'i' } },
        { 'error.message': { $regex: search, $options: 'i' } },
        { 'clinicalContext.category': { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const activities = await Activity.find(query)
      .populate('userId', 'firstName lastName email role facility')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const total = await Activity.countDocuments(query);

    // Transform activities for admin UI
    const transformedActivities = activities.map(activity => ({
      id: activity._id,
      timestamp: activity.timestamp,
      userId: activity.userId?._id || activity.userId,
      userName: activity.userId ? `${activity.userId.firstName} ${activity.userId.lastName}` : 'Unknown User',
      userEmail: activity.userId?.email || 'N/A',
      userRole: activity.userId?.role || 'N/A',
      userFacility: activity.userId?.facility || 'N/A',
      activityType: activity.activityType,
      action: activity.action?.name || activity.activityType,
      details: getActivityDetails(activity),
      location: activity.location ?
        `${activity.location.address || 'Unknown Location'}${activity.location.facility ? ` (${activity.location.facility})` : ''}` :
        'Unknown',
      ipAddress: activity.metadata?.ip || 'N/A',
      deviceInfo: activity.deviceId || 'N/A',
      severity: activity.error?.severity || (activity.activityType === 'error' ? 'medium' : 'low'),
      clinicalContext: activity.clinicalContext,
      performance: activity.performance,
      error: activity.error,
      sessionId: activity.sessionId
    }));

    res.json({
      success: true,
      data: {
        activities: transformedActivities,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get activity logs error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve activity logs',
      code: 'GET_ACTIVITY_LOGS_ERROR'
    });
  }
});

/**
 * GET /api/v1/admin/activity-logs/decision-support
 * Get detailed decision support activity logs
 */
router.get('/activity-logs/decision-support', validatePagination, validateDateRange, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      userId,
      startDate,
      endDate,
      sortBy = 'timestamp',
      sortOrder = 'desc'
    } = req.query;

    // Build query for decision support activities
    const query = {
      $or: [
        { activityType: { $regex: 'diagnosis', $options: 'i' } },
        { activityType: { $regex: 'clinical', $options: 'i' } },
        { 'screen.name': { $regex: 'clinical.*decision.*support', $options: 'i' } },
        { 'screen.name': { $regex: 'diagnosis', $options: 'i' } },
        { 'action.name': { $regex: 'diagnosis', $options: 'i' } },
        { 'action.name': { $regex: 'clinical', $options: 'i' } },
        { 'clinicalContext': { $exists: true } }
      ]
    };

    if (userId) query.userId = userId;

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const activities = await Activity.find(query)
      .populate('userId', 'firstName lastName email role facility state')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const total = await Activity.countDocuments(query);

    // Transform activities with detailed decision support context
    const transformedActivities = activities.map(activity => ({
      id: activity._id,
      timestamp: activity.timestamp,
      user: {
        id: activity.userId?._id || activity.userId,
        name: activity.userId ? `${activity.userId.firstName} ${activity.userId.lastName}` : 'Unknown User',
        email: activity.userId?.email || 'N/A',
        role: activity.userId?.role || 'N/A',
        facility: activity.userId?.facility || 'N/A',
        state: activity.userId?.state || 'N/A'
      },
      activityType: activity.activityType,
      action: activity.action?.name || activity.activityType,
      screen: activity.screen?.name || 'Unknown Screen',
      details: getDecisionSupportDetails(activity),
      clinicalContext: activity.clinicalContext || {},
      patientInfo: extractPatientInfo(activity),
      recommendations: extractRecommendations(activity),
      performance: activity.performance || {},
      location: {
        address: activity.location?.address || 'Unknown',
        facility: activity.location?.facility || 'N/A',
        facilityType: activity.location?.facilityType || 'N/A',
        coordinates: activity.location?.latitude && activity.location?.longitude ?
          `${activity.location.latitude}, ${activity.location.longitude}` : 'N/A'
      },
      deviceInfo: {
        deviceId: activity.deviceId || 'N/A',
        sessionId: activity.sessionId || 'N/A'
      },
      duration: activity.performance?.duration || 0,
      successful: activity.interaction?.successful !== false,
      error: activity.error
    }));

    // Get summary statistics
    const summaryStats = await Activity.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalActivities: { $sum: 1 },
          uniqueUsers: { $addToSet: '$userId' },
          avgDuration: { $avg: '$performance.duration' },
          successfulActivities: {
            $sum: {
              $cond: [{ $ne: ['$interaction.successful', false] }, 1, 0]
            }
          },
          clinicalCategories: { $addToSet: '$clinicalContext.category' },
          diagnosisTypes: { $addToSet: '$clinicalContext.diagnosisType' }
        }
      }
    ]);

    const stats = summaryStats[0] || {
      totalActivities: 0,
      uniqueUsers: [],
      avgDuration: 0,
      successfulActivities: 0,
      clinicalCategories: [],
      diagnosisTypes: []
    };

    res.json({
      success: true,
      data: {
        activities: transformedActivities,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        },
        summary: {
          totalActivities: stats.totalActivities,
          uniqueUsers: stats.uniqueUsers.length,
          avgDuration: Math.round(stats.avgDuration || 0),
          successRate: stats.totalActivities > 0 ?
            ((stats.successfulActivities / stats.totalActivities) * 100).toFixed(1) : '0',
          clinicalCategories: stats.clinicalCategories.filter(Boolean),
          diagnosisTypes: stats.diagnosisTypes.filter(Boolean)
        }
      }
    });

  } catch (error) {
    console.error('Get decision support activity logs error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve decision support activity logs',
      code: 'GET_DECISION_SUPPORT_LOGS_ERROR'
    });
  }
});

/**
 * GET /api/v1/admin/system/health
 * Get system health status
 */
router.get('/system/health', async (req, res) => {
  try {
    // Get database connection status
    const mongoose = require('mongoose');
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';

    // Get recent error rate
    const recentErrors = await Activity.countDocuments({
      activityType: 'error',
      timestamp: { $gte: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
    });

    const recentActivities = await Activity.countDocuments({
      timestamp: { $gte: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
    });

    const errorRate = recentActivities > 0 ? (recentErrors / recentActivities * 100).toFixed(2) : 0;

    // Get sync health
    const recentSyncs = await SyncLog.countDocuments({
      startedAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
    });

    const failedSyncs = await SyncLog.countDocuments({
      status: 'failed',
      startedAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
    });

    const syncSuccessRate = recentSyncs > 0 ? ((recentSyncs - failedSyncs) / recentSyncs * 100).toFixed(2) : 100;

    // Get active users in last 24 hours
    const activeUsers = await Activity.distinct('userId', {
      timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });

    res.json({
      success: true,
      data: {
        timestamp: new Date(),
        database: {
          status: dbStatus,
          healthy: dbStatus === 'connected'
        },
        errors: {
          recentCount: recentErrors,
          rate: parseFloat(errorRate),
          healthy: parseFloat(errorRate) < 5 // Less than 5% error rate is healthy
        },
        sync: {
          recentCount: recentSyncs,
          successRate: parseFloat(syncSuccessRate),
          healthy: parseFloat(syncSuccessRate) > 95 // More than 95% success rate is healthy
        },
        users: {
          active24h: activeUsers.length
        },
        overall: {
          healthy: dbStatus === 'connected' && parseFloat(errorRate) < 5 && parseFloat(syncSuccessRate) > 95
        }
      }
    });

  } catch (error) {
    console.error('Get system health error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve system health',
      code: 'GET_SYSTEM_HEALTH_ERROR'
    });
  }
});

// Helper functions
function getActivityDetails(activity) {
  if (activity.error) {
    return `Error: ${activity.error.message}`;
  }

  if (activity.clinicalContext) {
    const context = activity.clinicalContext;
    return `Clinical activity: ${context.category || 'Unknown'} - ${context.diagnosisId || context.recordId || 'N/A'}`;
  }

  if (activity.action) {
    return `${activity.action.name}: ${activity.action.value || activity.action.target || 'N/A'}`;
  }

  return `${activity.activityType} activity`;
}

function getDecisionSupportDetails(activity) {
  const details = [];

  if (activity.clinicalContext) {
    const ctx = activity.clinicalContext;
    if (ctx.category) details.push(`Category: ${ctx.category}`);
    if (ctx.severity) details.push(`Severity: ${ctx.severity}`);
    if (ctx.diagnosisId) details.push(`Diagnosis ID: ${ctx.diagnosisId}`);
  }

  if (activity.action) {
    details.push(`Action: ${activity.action.name}`);
    if (activity.action.value) details.push(`Value: ${activity.action.value}`);
  }

  if (activity.performance?.duration) {
    details.push(`Duration: ${Math.round(activity.performance.duration / 1000)}s`);
  }

  return details.join(' | ') || getActivityDetails(activity);
}

function extractPatientInfo(activity) {
  if (activity.action?.metadata?.patientInfo) {
    return activity.action.metadata.patientInfo;
  }

  if (activity.action?.value && typeof activity.action.value === 'object') {
    const value = activity.action.value;
    if (value.age || value.symptoms || value.chiefComplaint) {
      return {
        age: value.age,
        ageGroup: value.ageGroup,
        symptoms: value.symptoms,
        chiefComplaint: value.chiefComplaint,
        vitalSigns: value.vitalSigns
      };
    }
  }

  return null;
}

function extractRecommendations(activity) {
  if (activity.action?.metadata?.recommendations) {
    return activity.action.metadata.recommendations;
  }

  if (activity.action?.value?.recommendations) {
    return activity.action.value.recommendations;
  }

  return null;
}

/**
 * GET /api/v1/admin/sync-management
 * Get sync operations and statistics for admin management
 */
router.get('/sync-management', requireAdmin, validatePagination, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      syncType,
      startDate,
      endDate,
      userId,
      deviceId
    } = req.query;

    // Build query
    const query = {};

    if (status) query.status = status;
    if (syncType) query.syncType = syncType;
    if (userId) query.userId = userId;
    if (deviceId) query.deviceId = deviceId;

    if (startDate || endDate) {
      query.startedAt = {};
      if (startDate) query.startedAt.$gte = new Date(startDate);
      if (endDate) query.startedAt.$lte = new Date(endDate);
    }

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const syncLogs = await SyncLog.find(query)
      .populate('userId', 'firstName lastName email role facility')
      .sort({ startedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const totalCount = await SyncLog.countDocuments(query);

    // Transform data for frontend
    const operations = syncLogs.map(log => ({
      id: log._id.toString(),
      type: log.dataTypes?.join(', ') || log.syncType,
      status: log.status,
      progress: log.progress?.percentage || 0,
      startTime: log.startedAt,
      endTime: log.completedAt,
      recordsProcessed: log.progress?.processedItems || 0,
      totalRecords: log.progress?.totalItems || 0,
      errorCount: log.errors?.length || 0,
      deviceId: log.deviceId,
      userId: log.userId?._id?.toString(),
      userName: log.userId ? `${log.userId.firstName} ${log.userId.lastName}` : 'Unknown',
      userEmail: log.userId?.email,
      userRole: log.userId?.role,
      facility: log.userId?.facility,
      duration: log.duration,
      syncType: log.syncType,
      operation: log.operation,
      dataTypes: log.dataTypes,
      errors: log.errors
    }));

    // Get statistics
    const stats = await SyncLog.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const syncStats = {
      total: totalCount,
      completed: stats.find(s => s._id === 'completed')?.count || 0,
      running: stats.find(s => s._id === 'in_progress')?.count || 0,
      failed: stats.find(s => s._id === 'failed')?.count || 0,
      pending: stats.find(s => s._id === 'pending')?.count || 0
    };

    res.json({
      success: true,
      data: {
        operations,
        stats: syncStats,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          pages: Math.ceil(totalCount / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Error fetching sync management data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sync management data',
      error: error.message
    });
  }
});

/**
 * GET /api/v1/admin/patient-analytics
 * Get patient data analytics for dashboard visualization
 */
router.get('/patient-analytics', requireAdmin, validateDateRange, async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      groupBy = 'day', // day, week, month
      includeCharts = true,
      userId
    } = req.query;

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    // Get medical activity statistics
    const medicalActivities = await Activity.aggregate([
      {
        $match: {
          timestamp: { $gte: start, $lte: end },
          ...(userId ? { userId: new mongoose.Types.ObjectId(userId) } : {}),
          activityType: {
            $in: [
              'diagnosis_start', 'diagnosis_complete', 'clinical_decision_support',
              'neonatal_care_start', 'neonatal_assessment', 'patient_assessment',
              'clinical_record_access'
            ]
          }
        }
      },
      {
        $group: {
          _id: '$activityType',
          count: { $sum: 1 },
          uniquePatients: { $addToSet: '$medicalContext.patientId' }
        }
      },
      {
        $project: {
          activityType: '$_id',
          count: 1,
          uniquePatients: { $size: '$uniquePatients' }
        }
      }
    ]);

    // Get neonatal care statistics
    const neonatalStats = await Activity.aggregate([
      {
        $match: {
          timestamp: { $gte: start, $lte: end },
          ...(userId ? { userId: new mongoose.Types.ObjectId(userId) } : {}),
          $or: [
            { 'medicalContext.ageGroup': 'neonate' },
            { 'medicalContext.category': { $regex: /neonatal/i } },
            { activityType: { $in: ['neonatal_care_start', 'neonatal_assessment', 'immediate_newborn_care'] } }
          ]
        }
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: groupBy === 'day' ? '%Y-%m-%d' :
                       groupBy === 'week' ? '%Y-W%U' : '%Y-%m',
                date: '$timestamp'
              }
            },
            severity: '$medicalContext.severity'
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.date',
          total: { $sum: '$count' },
          severityBreakdown: {
            $push: {
              severity: '$_id.severity',
              count: '$count'
            }
          }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    // Get diagnosis trends
    const diagnosisTrends = await Activity.aggregate([
      {
        $match: {
          timestamp: { $gte: start, $lte: end },
          ...(userId ? { userId: new mongoose.Types.ObjectId(userId) } : {}),
          activityType: { $in: ['diagnosis_start', 'diagnosis_complete'] }
        }
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: groupBy === 'day' ? '%Y-%m-%d' :
                       groupBy === 'week' ? '%Y-W%U' : '%Y-%m',
                date: '$timestamp'
              }
            },
            status: '$activityType'
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.date',
          started: {
            $sum: {
              $cond: [{ $eq: ['$_id.status', 'diagnosis_start'] }, '$count', 0]
            }
          },
          completed: {
            $sum: {
              $cond: [{ $eq: ['$_id.status', 'diagnosis_complete'] }, '$count', 0]
            }
          }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    // Get age group distribution
    const ageGroupStats = await Activity.aggregate([
      {
        $match: {
          timestamp: { $gte: start, $lte: end },
          ...(userId ? { userId: new mongoose.Types.ObjectId(userId) } : {}),
          'medicalContext.ageGroup': { $exists: true, $ne: 'unknown' }
        }
      },
      {
        $group: {
          _id: '$medicalContext.ageGroup',
          count: { $sum: 1 },
          uniquePatients: { $addToSet: '$medicalContext.patientId' }
        }
      },
      {
        $project: {
          ageGroup: '$_id',
          count: 1,
          uniquePatients: { $size: '$uniquePatients' }
        }
      }
    ]);

    // Get clinical decision support usage
    const clinicalSupportStats = await Activity.aggregate([
      {
        $match: {
          timestamp: { $gte: start, $lte: end },
          ...(userId ? { userId: new mongoose.Types.ObjectId(userId) } : {}),
          activityType: 'clinical_decision_support'
        }
      },
      {
        $group: {
          _id: '$clinicalContext.urgencyLevel',
          count: { $sum: 1 },
          avgConfidence: { $avg: '$clinicalContext.confidence' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        period: { startDate: start, endDate: end },
        medicalActivities,
        neonatalCareStats: neonatalStats,
        diagnosisTrends,
        ageGroupDistribution: ageGroupStats,
        clinicalSupportUsage: clinicalSupportStats,
        summary: {
          totalMedicalActivities: medicalActivities.reduce((sum, activity) => sum + activity.count, 0),
          totalNeonatalCases: neonatalStats.reduce((sum, stat) => sum + stat.total, 0),
          totalDiagnoses: diagnosisTrends.reduce((sum, trend) => sum + trend.started, 0),
          completionRate: diagnosisTrends.length > 0 ?
            (diagnosisTrends.reduce((sum, trend) => sum + trend.completed, 0) /
             diagnosisTrends.reduce((sum, trend) => sum + trend.started, 0) * 100).toFixed(2) : 0
        }
      }
    });

  } catch (error) {
    console.error('Error fetching patient analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch patient analytics'
    });
  }
});

/**
 * GET /api/v1/admin/activity-logs
 * Get comprehensive activity logs with medical data including patient diagnosis and decision support
 */
router.get('/activity-logs', requireAdmin, validatePagination, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      startDate,
      endDate,
      userId,
      facility,
      activityType,
      patientId,
      diagnosisType,
      includeDetails = true
    } = req.query;

    // Build query for activities
    const activityQuery = {};
    if (userId) activityQuery.userId = userId;
    if (facility) activityQuery.facility = facility;
    if (activityType) activityQuery.activityType = { $regex: activityType, $options: 'i' };
    if (patientId) activityQuery['patient.patientId'] = patientId;

    if (startDate || endDate) {
      activityQuery.timestamp = {};
      if (startDate) activityQuery.timestamp.$gte = new Date(startDate);
      if (endDate) activityQuery.timestamp.$lte = new Date(endDate);
    }

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const activities = await Activity.find(activityQuery)
      .populate('userId', 'fullName email role facility state')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get related diagnoses for these activities
    const activityIds = activities.map(a => a._id);
    const diagnoses = await Diagnosis.find({
      $or: [
        { activityId: { $in: activityIds } },
        { userId: { $in: activities.map(a => a.userId) } }
      ]
    }).populate('userId', 'fullName email role facility').lean();

    // Transform activities with enhanced medical data
    const transformedActivities = activities.map(activity => {
      const relatedDiagnoses = diagnoses.filter(d =>
        d.activityId?.toString() === activity._id.toString() ||
        (d.userId?.toString() === activity.userId?._id?.toString() &&
         Math.abs(new Date(d.timestamp).getTime() - new Date(activity.timestamp).getTime()) < 300000) // 5 minutes
      );

      return {
        id: activity._id,
        timestamp: activity.timestamp,
        activityType: activity.activityType,
        userId: activity.userId?._id,
        userName: activity.userId?.fullName,
        userEmail: activity.userId?.email,
        userRole: activity.userId?.role,
        facility: activity.userId?.facility || activity.facility,
        state: activity.userId?.state,

        // Patient Information
        patient: activity.patient ? {
          patientId: activity.patient.patientId,
          age: activity.patient.age,
          gender: activity.patient.gender,
          location: activity.patient.location,
          symptoms: activity.patient.symptoms,
          vitalSigns: activity.patient.vitalSigns,
          medicalHistory: activity.patient.medicalHistory
        } : null,

        // Screen/Navigation Context
        screen: activity.screen,
        navigation: activity.navigation,

        // Action Details
        action: activity.action,

        // Decision Support Data
        decisionSupport: activity.decisionSupport ? {
          rulesTriggered: activity.decisionSupport.rulesTriggered,
          recommendations: activity.decisionSupport.recommendations,
          alerts: activity.decisionSupport.alerts,
          confidence: activity.decisionSupport.confidence,
          pathTaken: activity.decisionSupport.pathTaken,
          timeSpent: activity.decisionSupport.timeSpent,
          clinicianOverride: activity.decisionSupport.clinicianOverride
        } : null,

        // Feature Usage
        featureUsage: activity.featureUsage,

        // Performance Metrics
        performance: activity.performance,

        // Location Context
        location: activity.location,

        // Session Info
        sessionId: activity.sessionId,
        deviceId: activity.deviceId,

        // Related Diagnoses
        diagnoses: relatedDiagnoses.map(d => ({
          id: d._id,
          timestamp: d.timestamp,
          patientId: d.patientId,
          symptoms: d.symptoms,
          diagnosis: d.diagnosis,
          confidence: d.confidence,
          severity: d.severity,
          recommendations: d.recommendations,
          followUpRequired: d.followUpRequired,
          clinicianNotes: d.clinicianNotes,
          decisionSupportUsed: d.decisionSupportUsed,
          rulesApplied: d.rulesApplied,
          differentialDiagnoses: d.differentialDiagnoses
        })),

        // Raw metadata for detailed view
        ...(includeDetails === 'true' && {
          rawMetadata: {
            originalActivity: activity,
            relatedDiagnoses: relatedDiagnoses
          }
        })
      };
    });

    // Get statistics
    const totalActivities = await Activity.countDocuments(activityQuery);
    const totalDiagnoses = await Diagnosis.countDocuments({
      timestamp: activityQuery.timestamp,
      ...(userId && { userId }),
      ...(facility && { facility })
    });

    // Activity type breakdown
    const activityTypeStats = await Activity.aggregate([
      { $match: activityQuery },
      { $group: { _id: '$activityType', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Diagnosis stats
    const diagnosisStats = await Diagnosis.aggregate([
      {
        $match: {
          timestamp: activityQuery.timestamp,
          ...(userId && { userId }),
          ...(facility && { facility })
        }
      },
      {
        $group: {
          _id: null,
          totalDiagnoses: { $sum: 1 },
          avgConfidence: { $avg: '$confidence' },
          highConfidence: { $sum: { $cond: [{ $gte: ['$confidence', 0.8] }, 1, 0] } },
          followUpRequired: { $sum: { $cond: ['$followUpRequired', 1, 0] } }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        activities: transformedActivities,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalActivities,
          pages: Math.ceil(totalActivities / parseInt(limit))
        },
        statistics: {
          totalActivities,
          totalDiagnoses,
          activityTypes: activityTypeStats,
          diagnosisStats: diagnosisStats[0] || {
            totalDiagnoses: 0,
            avgConfidence: 0,
            highConfidence: 0,
            followUpRequired: 0
          }
        }
      }
    });

  } catch (error) {
    console.error('Error fetching activity logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch activity logs'
    });
  }
});

module.exports = router;
