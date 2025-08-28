const express = require('express');
const User = require('../models/User');
const Activity = require('../models/Activity');
const Diagnosis = require('../models/Diagnosis');
const { 
  authenticateToken, 
  verifyDevice,
  logRequest
} = require('../middleware/auth');
const { 
  validateProfileUpdate,
  validatePagination,
  validateDateRange
} = require('../middleware/validation');

const router = express.Router();

// Apply middleware to all user routes
router.use(logRequest);
router.use(authenticateToken);

/**
 * GET /api/v1/users/profile
 * Get user profile information
 */
router.get('/profile', async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password -activationKey')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: {
        user
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve profile',
      code: 'GET_PROFILE_ERROR'
    });
  }
});

/**
 * PUT /api/v1/users/profile
 * Update user profile information
 */
router.put('/profile', validateProfileUpdate, async (req, res) => {
  try {
    const updateFields = {};
    const allowedFields = ['firstName', 'lastName', 'facility', 'state', 'contactInfo'];
    
    // Only include allowed fields that are present in the request
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateFields[field] = req.body[field];
      }
    });

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update',
        code: 'NO_UPDATE_FIELDS'
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      updateFields,
      { new: true, runValidators: true }
    ).select('-password -activationKey');

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Log profile update activity
    const activity = new Activity({
      userId: req.user._id,
      deviceId: req.headers['x-device-id'],
      sessionId: req.headers['x-session-id'],
      activityType: 'form_submit',
      action: {
        name: 'profile_update',
        target: 'user_profile',
        value: Object.keys(updateFields)
      },
      metadata: {
        updatedFields: Object.keys(updateFields)
      },
      deviceInfo: req.body.deviceInfo,
      timestamp: new Date()
    });
    await activity.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: updatedUser,
        updatedFields: Object.keys(updateFields)
      }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile',
      code: 'UPDATE_PROFILE_ERROR'
    });
  }
});

/**
 * GET /api/v1/users/preferences
 * Get user preferences
 */
router.get('/preferences', async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('metadata')
      .lean();

    const preferences = user?.metadata?.preferences || {
      notifications: {
        push: true,
        email: true,
        sms: false
      },
      sync: {
        autoSync: true,
        syncFrequency: 'hourly',
        wifiOnly: false
      },
      privacy: {
        shareLocation: true,
        shareUsageData: true,
        shareErrorReports: true
      },
      display: {
        theme: 'light',
        language: 'en',
        fontSize: 'medium'
      }
    };

    res.json({
      success: true,
      data: {
        preferences
      }
    });

  } catch (error) {
    console.error('Get preferences error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve preferences',
      code: 'GET_PREFERENCES_ERROR'
    });
  }
});

/**
 * PUT /api/v1/users/preferences
 * Update user preferences
 */
router.put('/preferences', async (req, res) => {
  try {
    const { preferences } = req.body;

    if (!preferences || typeof preferences !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Invalid preferences data',
        code: 'INVALID_PREFERENCES'
      });
    }

    // Get current user metadata
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Update preferences in metadata
    if (!user.metadata) user.metadata = {};
    user.metadata.preferences = {
      ...user.metadata.preferences,
      ...preferences
    };

    await user.save();

    // Log preferences update activity
    const activity = new Activity({
      userId: req.user._id,
      deviceId: req.headers['x-device-id'],
      sessionId: req.headers['x-session-id'],
      activityType: 'form_submit',
      action: {
        name: 'preferences_update',
        target: 'user_preferences',
        value: Object.keys(preferences)
      },
      metadata: {
        updatedPreferences: Object.keys(preferences)
      },
      deviceInfo: req.body.deviceInfo,
      timestamp: new Date()
    });
    await activity.save();

    res.json({
      success: true,
      message: 'Preferences updated successfully',
      data: {
        preferences: user.metadata.preferences
      }
    });

  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update preferences',
      code: 'UPDATE_PREFERENCES_ERROR'
    });
  }
});

/**
 * GET /api/v1/users/device-info
 * Get device information for the current user
 */
router.get('/device-info', verifyDevice, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('deviceId lastLogin metadata')
      .lean();

    // Get latest device info from activities
    const latestActivity = await Activity.findOne({
      userId: req.user._id,
      deviceId: req.deviceId,
      deviceInfo: { $exists: true }
    })
    .sort({ timestamp: -1 })
    .select('deviceInfo networkInfo timestamp')
    .lean();

    const deviceInfo = {
      deviceId: user.deviceId,
      lastLogin: user.lastLogin,
      registeredAt: user.createdAt,
      latestDeviceInfo: latestActivity?.deviceInfo || null,
      latestNetworkInfo: latestActivity?.networkInfo || null,
      lastActivity: latestActivity?.timestamp || null
    };

    res.json({
      success: true,
      data: {
        deviceInfo
      }
    });

  } catch (error) {
    console.error('Get device info error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve device information',
      code: 'GET_DEVICE_INFO_ERROR'
    });
  }
});

/**
 * POST /api/v1/users/update-device-info
 * Update device information
 */
router.post('/update-device-info', verifyDevice, async (req, res) => {
  try {
    const { deviceInfo, networkInfo } = req.body;

    // Log device info update activity
    const activity = new Activity({
      userId: req.user._id,
      deviceId: req.deviceId,
      sessionId: req.headers['x-session-id'],
      activityType: 'form_submit',
      action: {
        name: 'device_info_update',
        target: 'device_info',
        value: 'updated'
      },
      deviceInfo,
      networkInfo,
      timestamp: new Date()
    });
    await activity.save();

    res.json({
      success: true,
      message: 'Device information updated successfully',
      data: {
        activityId: activity._id,
        timestamp: activity.timestamp
      }
    });

  } catch (error) {
    console.error('Update device info error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update device information',
      code: 'UPDATE_DEVICE_INFO_ERROR'
    });
  }
});

/**
 * GET /api/v1/users/dashboard-stats
 * Get dashboard statistics for the user
 */
router.get('/dashboard-stats', validateDateRange, async (req, res) => {
  try {
    const {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      endDate = new Date()
    } = req.query;

    const userId = req.user._id;
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Get activity statistics
    const activityStats = await Activity.aggregate([
      {
        $match: {
          userId: userId,
          timestamp: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: '$activityType',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get diagnosis statistics
    const diagnosisStats = await Diagnosis.aggregate([
      {
        $match: {
          userId: userId,
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get total counts
    const totalActivities = await Activity.countDocuments({
      userId: userId,
      timestamp: { $gte: start, $lte: end }
    });

    const totalDiagnoses = await Diagnosis.countDocuments({
      userId: userId,
      createdAt: { $gte: start, $lte: end }
    });

    // Get unique sessions
    const uniqueSessions = await Activity.distinct('sessionId', {
      userId: userId,
      timestamp: { $gte: start, $lte: end }
    });

    // Get error count
    const errorCount = await Activity.countDocuments({
      userId: userId,
      activityType: 'error',
      timestamp: { $gte: start, $lte: end }
    });

    // Get recent diagnoses
    const recentDiagnoses = await Diagnosis.find({
      userId: userId,
      createdAt: { $gte: start, $lte: end }
    })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('complaint.primary patient.name status createdAt location.facility')
    .lean();

    res.json({
      success: true,
      data: {
        period: {
          startDate: start,
          endDate: end
        },
        summary: {
          totalActivities,
          totalDiagnoses,
          uniqueSessions: uniqueSessions.length,
          errorCount
        },
        activityBreakdown: activityStats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {}),
        diagnosisBreakdown: diagnosisStats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {}),
        recentDiagnoses
      }
    });

  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve dashboard statistics',
      code: 'GET_DASHBOARD_STATS_ERROR'
    });
  }
});

/**
 * DELETE /api/v1/users/account
 * Deactivate user account (soft delete)
 */
router.delete('/account', verifyDevice, async (req, res) => {
  try {
    const { reason } = req.body;

    // Deactivate user account
    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        isActive: false,
        metadata: {
          ...req.user.metadata,
          deactivation: {
            reason: reason || 'User requested',
            timestamp: new Date(),
            deviceId: req.deviceId
          }
        }
      },
      { new: true }
    ).select('-password -activationKey');

    // Log account deactivation activity
    const activity = new Activity({
      userId: req.user._id,
      deviceId: req.deviceId,
      sessionId: req.headers['x-session-id'],
      activityType: 'form_submit',
      action: {
        name: 'account_deactivation',
        target: 'user_account',
        value: 'deactivated'
      },
      metadata: {
        reason: reason || 'User requested'
      },
      timestamp: new Date()
    });
    await activity.save();

    res.json({
      success: true,
      message: 'Account deactivated successfully',
      data: {
        deactivatedAt: new Date(),
        reason: reason || 'User requested'
      }
    });

  } catch (error) {
    console.error('Deactivate account error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to deactivate account',
      code: 'DEACTIVATE_ACCOUNT_ERROR'
    });
  }
});

module.exports = router;
