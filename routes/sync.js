const express = require('express');
const Activity = require('../models/Activity');
const Diagnosis = require('../models/Diagnosis');
const SyncLog = require('../models/SyncLog');
const User = require('../models/User');
const { 
  authenticateToken, 
  verifyDevice, 
  extractSession,
  logRequest
} = require('../middleware/auth');
const { 
  validateSync,
  validatePagination,
  validateDateRange
} = require('../middleware/validation');

const router = express.Router();

// Apply middleware to all sync routes
router.use(logRequest);
router.use(authenticateToken);
router.use(verifyDevice);

/**
 * POST /api/v1/sync/upload
 * Upload data from mobile app to server
 */
router.post('/upload', validateSync, async (req, res) => {
  let syncLog = null;
  
  try {
    const {
      syncType,
      operation,
      dataTypes,
      data,
      sessionId,
      deviceInfo,
      networkInfo
    } = req.body;

    // Create sync log
    syncLog = new SyncLog({
      userId: req.user._id,
      deviceId: req.deviceId,
      sessionId,
      syncType,
      operation,
      dataTypes,
      status: 'in_progress',
      deviceInfo,
      networkInfo,
      progress: {
        totalItems: Object.values(data).reduce((sum, items) => sum + (Array.isArray(items) ? items.length : 0), 0)
      }
    });
    await syncLog.save();

    const results = {
      successful: [],
      failed: [],
      conflicts: []
    };

    // Process each data type
    for (const dataType of dataTypes) {
      if (!data[dataType] || !Array.isArray(data[dataType])) continue;

      for (const item of data[dataType]) {
        try {
          let savedItem = null;
          
          switch (dataType) {
            case 'activities':
              // Check for existing activity to prevent duplicates
              const existingActivity = await Activity.findOne({
                userId: req.user._id,
                deviceId: req.deviceId,
                sessionId: item.sessionId,
                activityType: item.activityType,
                timestamp: new Date(item.timestamp)
              });

              if (!existingActivity) {
                const activity = new Activity({
                  ...item,
                  userId: req.user._id,
                  deviceId: req.deviceId,
                  syncStatus: 'synced',
                  syncedAt: new Date()
                });
                savedItem = await activity.save();
              } else {
                savedItem = existingActivity;
              }
              break;

            case 'diagnoses':
              // Check for existing diagnosis
              const existingDiagnosis = await Diagnosis.findOne({
                userId: req.user._id,
                deviceId: req.deviceId,
                sessionId: item.sessionId,
                'patient.id': item.patient?.id,
                createdAt: new Date(item.createdAt)
              });

              if (!existingDiagnosis) {
                const diagnosis = new Diagnosis({
                  ...item,
                  userId: req.user._id,
                  deviceId: req.deviceId,
                  syncStatus: 'synced',
                  syncedAt: new Date()
                });
                savedItem = await diagnosis.save();
              } else {
                // Check for conflicts
                if (existingDiagnosis.lastModified < new Date(item.lastModified)) {
                  // Server version is older, update it
                  Object.assign(existingDiagnosis, item);
                  existingDiagnosis.syncStatus = 'synced';
                  existingDiagnosis.syncedAt = new Date();
                  savedItem = await existingDiagnosis.save();
                } else if (existingDiagnosis.lastModified > new Date(item.lastModified)) {
                  // Client version is older, conflict detected
                  await syncLog.addConflict(
                    item._id || item.id,
                    dataType,
                    'concurrent_modification',
                    item,
                    existingDiagnosis.toObject()
                  );
                  results.conflicts.push({
                    itemId: item._id || item.id,
                    dataType,
                    reason: 'concurrent_modification'
                  });
                  continue;
                } else {
                  savedItem = existingDiagnosis;
                }
              }
              break;

            case 'user_profile':
              // Update user profile
              const updateFields = {};
              if (item.firstName) updateFields.firstName = item.firstName;
              if (item.lastName) updateFields.lastName = item.lastName;
              if (item.facility) updateFields.facility = item.facility;
              if (item.state) updateFields.state = item.state;
              if (item.contactInfo) updateFields.contactInfo = item.contactInfo;

              if (Object.keys(updateFields).length > 0) {
                await User.findByIdAndUpdate(req.user._id, updateFields);
                savedItem = { updated: true, fields: Object.keys(updateFields) };
              }
              break;

            default:
              throw new Error(`Unsupported data type: ${dataType}`);
          }

          results.successful.push({
            itemId: item._id || item.id,
            dataType,
            serverId: savedItem?._id
          });

          // Update progress
          await syncLog.updateProgress(
            results.successful.length + results.failed.length,
            results.successful.length,
            results.failed.length
          );

        } catch (itemError) {
          console.error(`Error processing ${dataType} item:`, itemError);
          
          results.failed.push({
            itemId: item._id || item.id,
            dataType,
            error: itemError.message
          });

          await syncLog.addError(
            'ITEM_PROCESSING_ERROR',
            itemError.message,
            'medium',
            dataType,
            item._id || item.id
          );
        }
      }
    }

    // Mark sync as completed
    const status = results.failed.length > 0 ? 'partial' : 'completed';
    await syncLog.markCompleted(status);

    res.json({
      success: true,
      message: `Upload ${status}`,
      data: {
        syncId: syncLog._id,
        results: {
          successful: results.successful.length,
          failed: results.failed.length,
          conflicts: results.conflicts.length
        },
        details: results
      }
    });

  } catch (error) {
    console.error('Upload sync error:', error);
    
    if (syncLog) {
      await syncLog.addError('SYNC_ERROR', error.message, 'high');
      await syncLog.markCompleted('failed');
    }

    res.status(500).json({
      success: false,
      error: 'Upload sync failed',
      code: 'UPLOAD_SYNC_ERROR'
    });
  }
});

/**
 * POST /api/v1/sync/download
 * Download data from server to mobile app
 */
router.post('/download', validateSync, async (req, res) => {
  let syncLog = null;
  
  try {
    const {
      syncType,
      operation,
      dataTypes,
      lastSyncTimestamp,
      sessionId,
      deviceInfo,
      networkInfo
    } = req.body;

    // Create sync log
    syncLog = new SyncLog({
      userId: req.user._id,
      deviceId: req.deviceId,
      sessionId,
      syncType,
      operation,
      dataTypes,
      status: 'in_progress',
      deviceInfo,
      networkInfo
    });
    await syncLog.save();

    const data = {};
    const lastSync = lastSyncTimestamp ? new Date(lastSyncTimestamp) : new Date(0);

    // Fetch data for each requested type
    for (const dataType of dataTypes) {
      try {
        switch (dataType) {
          case 'activities':
            data.activities = await Activity.find({
              userId: req.user._id,
              updatedAt: { $gt: lastSync },
              syncStatus: 'synced'
            })
            .sort({ updatedAt: -1 })
            .limit(1000) // Limit to prevent large responses
            .lean();
            break;

          case 'diagnoses':
            data.diagnoses = await Diagnosis.find({
              userId: req.user._id,
              updatedAt: { $gt: lastSync },
              syncStatus: 'synced'
            })
            .sort({ updatedAt: -1 })
            .limit(500)
            .lean();
            break;

          case 'user_profile':
            const user = await User.findById(req.user._id)
              .select('firstName lastName facility state contactInfo updatedAt')
              .lean();
            
            if (user && user.updatedAt > lastSync) {
              data.user_profile = user;
            }
            break;

          default:
            console.warn(`Unsupported download data type: ${dataType}`);
        }
      } catch (typeError) {
        console.error(`Error fetching ${dataType}:`, typeError);
        await syncLog.addError(
          'DATA_FETCH_ERROR',
          typeError.message,
          'medium',
          dataType
        );
      }
    }

    // Calculate total items
    const totalItems = Object.values(data).reduce((sum, items) => {
      return sum + (Array.isArray(items) ? items.length : (items ? 1 : 0));
    }, 0);

    // Update sync log progress
    await syncLog.updateProgress(totalItems, totalItems, 0);
    await syncLog.markCompleted('completed');

    res.json({
      success: true,
      message: 'Download completed',
      data: {
        syncId: syncLog._id,
        timestamp: new Date(),
        data,
        summary: {
          totalItems,
          dataTypes: Object.keys(data)
        }
      }
    });

  } catch (error) {
    console.error('Download sync error:', error);
    
    if (syncLog) {
      await syncLog.addError('SYNC_ERROR', error.message, 'high');
      await syncLog.markCompleted('failed');
    }

    res.status(500).json({
      success: false,
      error: 'Download sync failed',
      code: 'DOWNLOAD_SYNC_ERROR'
    });
  }
});

/**
 * GET /api/v1/sync/status
 * Get sync status and history
 */
router.get('/status', validatePagination, validateDateRange, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      startDate,
      endDate,
      status,
      syncType
    } = req.query;

    // Build query
    const query = {
      userId: req.user._id,
      deviceId: req.deviceId
    };
    
    if (status) query.status = status;
    if (syncType) query.syncType = syncType;
    
    if (startDate || endDate) {
      query.startedAt = {};
      if (startDate) query.startedAt.$gte = new Date(startDate);
      if (endDate) query.startedAt.$lte = new Date(endDate);
    }

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const syncLogs = await SyncLog.find(query)
      .sort({ startedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const total = await SyncLog.countDocuments(query);

    // Get latest sync info
    const latestSync = await SyncLog.findOne({
      userId: req.user._id,
      deviceId: req.deviceId,
      status: 'completed'
    })
    .sort({ completedAt: -1 })
    .lean();

    res.json({
      success: true,
      data: {
        syncLogs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        },
        latestSync: latestSync ? {
          timestamp: latestSync.completedAt,
          syncType: latestSync.syncType,
          operation: latestSync.operation,
          dataTypes: latestSync.dataTypes
        } : null
      }
    });

  } catch (error) {
    console.error('Get sync status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve sync status',
      code: 'GET_SYNC_STATUS_ERROR'
    });
  }
});

/**
 * GET /api/v1/sync/conflicts
 * Get unresolved sync conflicts
 */
router.get('/conflicts', validatePagination, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    // Find sync logs with unresolved conflicts
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const syncLogsWithConflicts = await SyncLog.find({
      userId: req.user._id,
      deviceId: req.deviceId,
      'conflicts.resolution': 'manual_review'
    })
    .sort({ startedAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

    // Extract conflicts
    const conflicts = [];
    syncLogsWithConflicts.forEach(log => {
      log.conflicts.forEach(conflict => {
        if (conflict.resolution === 'manual_review') {
          conflicts.push({
            syncId: log._id,
            syncTimestamp: log.startedAt,
            ...conflict
          });
        }
      });
    });

    res.json({
      success: true,
      data: {
        conflicts,
        count: conflicts.length
      }
    });

  } catch (error) {
    console.error('Get sync conflicts error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve sync conflicts',
      code: 'GET_SYNC_CONFLICTS_ERROR'
    });
  }
});

/**
 * POST /api/v1/sync/resolve-conflict
 * Resolve a sync conflict
 */
router.post('/resolve-conflict', async (req, res) => {
  try {
    const { syncId, conflictItemId, resolution, mergedData } = req.body;

    const syncLog = await SyncLog.findOne({
      _id: syncId,
      userId: req.user._id,
      deviceId: req.deviceId
    });

    if (!syncLog) {
      return res.status(404).json({
        success: false,
        error: 'Sync log not found',
        code: 'SYNC_LOG_NOT_FOUND'
      });
    }

    // Find and update the conflict
    const conflict = syncLog.conflicts.find(c => c.itemId === conflictItemId);
    if (!conflict) {
      return res.status(404).json({
        success: false,
        error: 'Conflict not found',
        code: 'CONFLICT_NOT_FOUND'
      });
    }

    conflict.resolution = resolution;
    conflict.resolvedAt = new Date();
    conflict.resolvedBy = req.user._id;
    
    if (mergedData) {
      conflict.mergedVersion = mergedData;
    }

    await syncLog.save();

    res.json({
      success: true,
      message: 'Conflict resolved successfully',
      data: {
        conflictItemId,
        resolution
      }
    });

  } catch (error) {
    console.error('Resolve conflict error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resolve conflict',
      code: 'RESOLVE_CONFLICT_ERROR'
    });
  }
});

module.exports = router;
