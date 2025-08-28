const express = require('express');
const Diagnosis = require('../models/Diagnosis');
const Activity = require('../models/Activity');
const { 
  authenticateToken, 
  verifyDevice, 
  extractSession,
  logRequest
} = require('../middleware/auth');
const { 
  validateDiagnosis,
  validatePagination,
  validateDateRange,
  validateObjectId
} = require('../middleware/validation');

const router = express.Router();

// Apply middleware to all diagnosis routes
router.use(logRequest);
router.use(authenticateToken);
router.use(verifyDevice);

/**
 * POST /api/v1/diagnosis
 * Create a new diagnosis
 */
router.post('/', validateDiagnosis, async (req, res) => {
  try {
    const diagnosisData = {
      ...req.body,
      userId: req.user._id,
      deviceId: req.deviceId,
      status: 'draft'
    };

    const diagnosis = new Diagnosis(diagnosisData);
    await diagnosis.save();

    // Log diagnosis creation activity
    const activity = new Activity({
      userId: req.user._id,
      deviceId: req.deviceId,
      sessionId: req.body.sessionId,
      activityType: 'diagnosis_start',
      action: {
        name: 'diagnosis_created',
        target: 'diagnosis',
        value: diagnosis._id.toString()
      },
      metadata: {
        diagnosisId: diagnosis._id,
        primaryComplaint: diagnosis.complaint.primary
      },
      location: req.body.location,
      deviceInfo: req.body.deviceInfo,
      timestamp: new Date()
    });
    await activity.save();

    res.status(201).json({
      success: true,
      message: 'Diagnosis created successfully',
      data: {
        diagnosis: {
          id: diagnosis._id,
          status: diagnosis.status,
          createdAt: diagnosis.createdAt,
          primaryComplaint: diagnosis.complaint.primary
        }
      }
    });

  } catch (error) {
    console.error('Create diagnosis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create diagnosis',
      code: 'CREATE_DIAGNOSIS_ERROR'
    });
  }
});

/**
 * GET /api/v1/diagnosis
 * Get user's diagnoses with pagination and filtering
 */
router.get('/', validatePagination, validateDateRange, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      priority,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    const query = { userId: req.user._id };
    
    if (status) query.status = status;
    if (priority) query.priority = priority;
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const diagnoses = await Diagnosis.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .select('complaint patient status priority location createdAt lastModified syncStatus')
      .lean();

    // Get total count for pagination
    const total = await Diagnosis.countDocuments(query);

    res.json({
      success: true,
      data: {
        diagnoses,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get diagnoses error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve diagnoses',
      code: 'GET_DIAGNOSES_ERROR'
    });
  }
});

/**
 * GET /api/v1/diagnosis/:diagnosisId
 * Get a specific diagnosis by ID
 */
router.get('/:diagnosisId', validateObjectId('diagnosisId'), async (req, res) => {
  try {
    const { diagnosisId } = req.params;

    const diagnosis = await Diagnosis.findOne({
      _id: diagnosisId,
      userId: req.user._id
    }).lean();

    if (!diagnosis) {
      return res.status(404).json({
        success: false,
        error: 'Diagnosis not found',
        code: 'DIAGNOSIS_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: { diagnosis }
    });

  } catch (error) {
    console.error('Get diagnosis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve diagnosis',
      code: 'GET_DIAGNOSIS_ERROR'
    });
  }
});

/**
 * PUT /api/v1/diagnosis/:diagnosisId
 * Update a diagnosis
 */
router.put('/:diagnosisId', validateObjectId('diagnosisId'), async (req, res) => {
  try {
    const { diagnosisId } = req.params;
    const updateData = { ...req.body };
    
    // Remove fields that shouldn't be updated directly
    delete updateData.userId;
    delete updateData.deviceId;
    delete updateData.createdAt;
    
    // Update lastModified timestamp
    updateData.lastModified = new Date();

    const diagnosis = await Diagnosis.findOneAndUpdate(
      { _id: diagnosisId, userId: req.user._id },
      updateData,
      { new: true, runValidators: true }
    );

    if (!diagnosis) {
      return res.status(404).json({
        success: false,
        error: 'Diagnosis not found',
        code: 'DIAGNOSIS_NOT_FOUND'
      });
    }

    // Log diagnosis update activity
    const activity = new Activity({
      userId: req.user._id,
      deviceId: req.deviceId,
      sessionId: req.body.sessionId || req.headers['x-session-id'],
      activityType: 'form_submit',
      action: {
        name: 'diagnosis_updated',
        target: 'diagnosis',
        value: diagnosis._id.toString()
      },
      metadata: {
        diagnosisId: diagnosis._id,
        updatedFields: Object.keys(updateData)
      },
      deviceInfo: req.body.deviceInfo,
      timestamp: new Date()
    });
    await activity.save();

    res.json({
      success: true,
      message: 'Diagnosis updated successfully',
      data: { diagnosis }
    });

  } catch (error) {
    console.error('Update diagnosis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update diagnosis',
      code: 'UPDATE_DIAGNOSIS_ERROR'
    });
  }
});

/**
 * PUT /api/v1/diagnosis/:diagnosisId/status
 * Update diagnosis status
 */
router.put('/:diagnosisId/status', validateObjectId('diagnosisId'), async (req, res) => {
  try {
    const { diagnosisId } = req.params;
    const { status, notes } = req.body;

    const validStatuses = ['draft', 'in_progress', 'completed', 'reviewed', 'archived'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status',
        code: 'INVALID_STATUS',
        validStatuses
      });
    }

    const diagnosis = await Diagnosis.findOneAndUpdate(
      { _id: diagnosisId, userId: req.user._id },
      { 
        status, 
        lastModified: new Date(),
        ...(notes && { 'metadata.statusNotes': notes })
      },
      { new: true }
    );

    if (!diagnosis) {
      return res.status(404).json({
        success: false,
        error: 'Diagnosis not found',
        code: 'DIAGNOSIS_NOT_FOUND'
      });
    }

    // Log status change activity
    const activityType = status === 'completed' ? 'diagnosis_complete' : 'form_submit';
    const activity = new Activity({
      userId: req.user._id,
      deviceId: req.deviceId,
      sessionId: req.headers['x-session-id'],
      activityType,
      action: {
        name: 'diagnosis_status_changed',
        target: 'diagnosis',
        value: status
      },
      metadata: {
        diagnosisId: diagnosis._id,
        previousStatus: req.body.previousStatus,
        newStatus: status,
        notes
      },
      timestamp: new Date()
    });
    await activity.save();

    res.json({
      success: true,
      message: `Diagnosis status updated to ${status}`,
      data: {
        diagnosisId: diagnosis._id,
        status: diagnosis.status,
        lastModified: diagnosis.lastModified
      }
    });

  } catch (error) {
    console.error('Update diagnosis status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update diagnosis status',
      code: 'UPDATE_DIAGNOSIS_STATUS_ERROR'
    });
  }
});

/**
 * DELETE /api/v1/diagnosis/:diagnosisId
 * Delete a diagnosis (soft delete by archiving)
 */
router.delete('/:diagnosisId', validateObjectId('diagnosisId'), async (req, res) => {
  try {
    const { diagnosisId } = req.params;

    const diagnosis = await Diagnosis.findOneAndUpdate(
      { _id: diagnosisId, userId: req.user._id },
      { 
        status: 'archived',
        lastModified: new Date(),
        'metadata.archivedAt': new Date(),
        'metadata.archivedBy': req.user._id
      },
      { new: true }
    );

    if (!diagnosis) {
      return res.status(404).json({
        success: false,
        error: 'Diagnosis not found',
        code: 'DIAGNOSIS_NOT_FOUND'
      });
    }

    // Log deletion activity
    const activity = new Activity({
      userId: req.user._id,
      deviceId: req.deviceId,
      sessionId: req.headers['x-session-id'],
      activityType: 'form_submit',
      action: {
        name: 'diagnosis_archived',
        target: 'diagnosis',
        value: diagnosis._id.toString()
      },
      metadata: {
        diagnosisId: diagnosis._id
      },
      timestamp: new Date()
    });
    await activity.save();

    res.json({
      success: true,
      message: 'Diagnosis archived successfully',
      data: {
        diagnosisId: diagnosis._id,
        archivedAt: diagnosis.metadata.archivedAt
      }
    });

  } catch (error) {
    console.error('Archive diagnosis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to archive diagnosis',
      code: 'ARCHIVE_DIAGNOSIS_ERROR'
    });
  }
});

/**
 * GET /api/v1/diagnosis/stats/summary
 * Get diagnosis statistics summary
 */
router.get('/stats/summary', validateDateRange, async (req, res) => {
  try {
    const {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      endDate = new Date()
    } = req.query;

    const stats = await Diagnosis.getDiagnosisStats(
      req.user._id,
      new Date(startDate),
      new Date(endDate)
    );

    // Get total count
    const totalDiagnoses = await Diagnosis.countDocuments({
      userId: req.user._id,
      createdAt: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    });

    // Get priority breakdown
    const priorityStats = await Diagnosis.aggregate([
      {
        $match: {
          userId: req.user._id,
          createdAt: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
          }
        }
      },
      {
        $group: {
          _id: '$priority',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        period: {
          startDate: new Date(startDate),
          endDate: new Date(endDate)
        },
        summary: {
          total: totalDiagnoses,
          statusBreakdown: stats.reduce((acc, stat) => {
            acc[stat._id] = stat.count;
            return acc;
          }, {}),
          priorityBreakdown: priorityStats.reduce((acc, stat) => {
            acc[stat._id] = stat.count;
            return acc;
          }, {})
        }
      }
    });

  } catch (error) {
    console.error('Get diagnosis stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve diagnosis statistics',
      code: 'GET_DIAGNOSIS_STATS_ERROR'
    });
  }
});

module.exports = router;
