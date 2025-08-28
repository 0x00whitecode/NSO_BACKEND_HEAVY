const express = require('express');
const Activity = require('../models/Activity');
const { 
  authenticateToken, 
  verifyDevice, 
  extractSession,
  logRequest
} = require('../middleware/auth');
const { 
  validateActivity, 
  validateBatchActivity,
  validatePagination,
  validateDateRange,
  validateObjectId
} = require('../middleware/validation');

const router = express.Router();

// Apply middleware to all activity routes
router.use(logRequest);
router.use(authenticateToken);
router.use(verifyDevice);

/**
 * POST /api/v1/activity/track
 * Track a single user activity
 */
router.post('/track', validateActivity, async (req, res) => {
  try {
    const activityData = {
      ...req.body,
      userId: req.user._id,
      deviceId: req.deviceId,
      timestamp: req.body.timestamp || new Date()
    };

    const activity = new Activity(activityData);
    await activity.save();

    res.status(201).json({
      success: true,
      message: 'Activity tracked successfully',
      data: {
        activityId: activity._id,
        timestamp: activity.timestamp
      }
    });

  } catch (error) {
    console.error('Activity tracking error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track activity',
      code: 'ACTIVITY_TRACKING_ERROR'
    });
  }
});

/**
 * POST /api/v1/activity/batch
 * Track multiple activities in a single request
 */
router.post('/batch', validateBatchActivity, async (req, res) => {
  try {
    const { activities } = req.body;
    
    // Prepare activities with user and device info
    const activitiesWithMetadata = activities.map(activity => ({
      ...activity,
      userId: req.user._id,
      deviceId: req.deviceId,
      timestamp: activity.timestamp || new Date()
    }));

    // Insert all activities
    const savedActivities = await Activity.insertMany(activitiesWithMetadata);

    res.status(201).json({
      success: true,
      message: `${savedActivities.length} activities tracked successfully`,
      data: {
        count: savedActivities.length,
        activityIds: savedActivities.map(a => a._id)
      }
    });

  } catch (error) {
    console.error('Batch activity tracking error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track activities',
      code: 'BATCH_ACTIVITY_TRACKING_ERROR'
    });
  }
});

/**
 * GET /api/v1/activity/user
 * Get user's activity history with pagination and filtering
 */
router.get('/user', validatePagination, validateDateRange, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = 'timestamp',
      sortOrder = 'desc',
      activityType,
      startDate,
      endDate
    } = req.query;

    // Build query
    const query = { userId: req.user._id };
    
    if (activityType) {
      query.activityType = activityType;
    }
    
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
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const total = await Activity.countDocuments(query);

    res.json({
      success: true,
      data: {
        activities,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get user activities error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve activities',
      code: 'GET_ACTIVITIES_ERROR'
    });
  }
});

/**
 * GET /api/v1/activity/session/:sessionId
 * Get activities for a specific session
 */
router.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { sortBy = 'timestamp', sortOrder = 'asc' } = req.query;

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const activities = await Activity.find({
      userId: req.user._id,
      sessionId
    })
    .sort(sort)
    .lean();

    res.json({
      success: true,
      data: {
        sessionId,
        activities,
        count: activities.length
      }
    });

  } catch (error) {
    console.error('Get session activities error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve session activities',
      code: 'GET_SESSION_ACTIVITIES_ERROR'
    });
  }
});

/**
 * GET /api/v1/activity/stats
 * Get activity statistics for the user
 */
router.get('/stats', validateDateRange, async (req, res) => {
  try {
    const {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      endDate = new Date()
    } = req.query;

    // Get activity statistics
    const stats = await Activity.getActivityStats(
      req.user._id,
      new Date(startDate),
      new Date(endDate)
    );

    // Get total activities count
    const totalActivities = await Activity.countDocuments({
      userId: req.user._id,
      timestamp: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    });

    // Get unique sessions count
    const uniqueSessions = await Activity.distinct('sessionId', {
      userId: req.user._id,
      timestamp: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    });

    // Get error count
    const errorCount = await Activity.countDocuments({
      userId: req.user._id,
      activityType: 'error',
      timestamp: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    });

    res.json({
      success: true,
      data: {
        period: {
          startDate: new Date(startDate),
          endDate: new Date(endDate)
        },
        summary: {
          totalActivities,
          uniqueSessions: uniqueSessions.length,
          errorCount
        },
        activityBreakdown: stats
      }
    });

  } catch (error) {
    console.error('Get activity stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve activity statistics',
      code: 'GET_ACTIVITY_STATS_ERROR'
    });
  }
});

/**
 * GET /api/v1/activity/performance
 * Get performance metrics for the user
 */
router.get('/performance', validateDateRange, async (req, res) => {
  try {
    const {
      startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      endDate = new Date()
    } = req.query;

    const performanceMetrics = await Activity.aggregate([
      {
        $match: {
          userId: req.user._id,
          activityType: 'performance',
          timestamp: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
          }
        }
      },
      {
        $group: {
          _id: null,
          avgDuration: { $avg: '$performance.duration' },
          avgLoadTime: { $avg: '$performance.loadTime' },
          avgMemoryUsage: { $avg: '$performance.memoryUsage' },
          avgNetworkLatency: { $avg: '$performance.networkLatency' },
          avgBatteryLevel: { $avg: '$performance.batteryLevel' },
          count: { $sum: 1 }
        }
      }
    ]);

    const metrics = performanceMetrics[0] || {
      avgDuration: 0,
      avgLoadTime: 0,
      avgMemoryUsage: 0,
      avgNetworkLatency: 0,
      avgBatteryLevel: 0,
      count: 0
    };

    res.json({
      success: true,
      data: {
        period: {
          startDate: new Date(startDate),
          endDate: new Date(endDate)
        },
        metrics: {
          averageDuration: Math.round(metrics.avgDuration || 0),
          averageLoadTime: Math.round(metrics.avgLoadTime || 0),
          averageMemoryUsage: Math.round(metrics.avgMemoryUsage || 0),
          averageNetworkLatency: Math.round(metrics.avgNetworkLatency || 0),
          averageBatteryLevel: Math.round(metrics.avgBatteryLevel || 0),
          sampleCount: metrics.count
        }
      }
    });

  } catch (error) {
    console.error('Get performance metrics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve performance metrics',
      code: 'GET_PERFORMANCE_METRICS_ERROR'
    });
  }
});

/**
 * GET /api/v1/activity/errors
 * Get error activities for the user
 */
router.get('/errors', validatePagination, validateDateRange, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      severity,
      startDate,
      endDate
    } = req.query;

    // Build query
    const query = {
      userId: req.user._id,
      activityType: 'error'
    };
    
    if (severity) {
      query['error.severity'] = severity;
    }
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const errors = await Activity.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const total = await Activity.countDocuments(query);

    res.json({
      success: true,
      data: {
        errors,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get error activities error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve error activities',
      code: 'GET_ERROR_ACTIVITIES_ERROR'
    });
  }
});

/**
 * DELETE /api/v1/activity/cleanup
 * Clean up old activities (older than specified days)
 */
router.delete('/cleanup', async (req, res) => {
  try {
    const { days = 90 } = req.query;
    const cutoffDate = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

    const result = await Activity.deleteMany({
      userId: req.user._id,
      timestamp: { $lt: cutoffDate },
      syncStatus: 'synced' // Only delete synced activities
    });

    res.json({
      success: true,
      message: `Cleaned up ${result.deletedCount} old activities`,
      data: {
        deletedCount: result.deletedCount,
        cutoffDate
      }
    });

  } catch (error) {
    console.error('Activity cleanup error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup activities',
      code: 'ACTIVITY_CLEANUP_ERROR'
    });
  }
});

module.exports = router;
