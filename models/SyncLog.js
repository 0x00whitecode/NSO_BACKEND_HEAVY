const mongoose = require('mongoose');

const syncLogSchema = new mongoose.Schema({
  // User and Device Information
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required']
  },
  deviceId: {
    type: String,
    required: [true, 'Device ID is required'],
    trim: true
  },
  sessionId: {
    type: String,
    required: [true, 'Session ID is required'],
    trim: true
  },

  // Sync Operation Details
  syncType: {
    type: String,
    enum: ['upload', 'download', 'bidirectional', 'conflict_resolution'],
    required: [true, 'Sync type is required']
  },
  operation: {
    type: String,
    enum: ['full_sync', 'incremental_sync', 'delta_sync', 'manual_sync', 'auto_sync'],
    required: [true, 'Operation type is required']
  },
  
  // Data Categories
  dataTypes: [{
    type: String,
    enum: ['activities', 'diagnoses', 'user_profile', 'preferences', 'clinical_records', 'media_files'],
    required: true
  }],

  // Sync Status and Progress
  status: {
    type: String,
    enum: ['initiated', 'in_progress', 'completed', 'failed', 'cancelled', 'partial'],
    default: 'initiated'
  },
  progress: {
    totalItems: {
      type: Number,
      default: 0,
      min: [0, 'Total items cannot be negative']
    },
    processedItems: {
      type: Number,
      default: 0,
      min: [0, 'Processed items cannot be negative']
    },
    successfulItems: {
      type: Number,
      default: 0,
      min: [0, 'Successful items cannot be negative']
    },
    failedItems: {
      type: Number,
      default: 0,
      min: [0, 'Failed items cannot be negative']
    },
    skippedItems: {
      type: Number,
      default: 0,
      min: [0, 'Skipped items cannot be negative']
    },
    percentage: {
      type: Number,
      default: 0,
      min: [0, 'Percentage cannot be negative'],
      max: [100, 'Percentage cannot exceed 100']
    }
  },

  // Timing Information
  startedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date,
    default: null
  },
  duration: {
    type: Number, // in milliseconds
    default: null
  },

  // Data Transfer Statistics
  dataTransfer: {
    uploadedBytes: {
      type: Number,
      default: 0,
      min: [0, 'Uploaded bytes cannot be negative']
    },
    downloadedBytes: {
      type: Number,
      default: 0,
      min: [0, 'Downloaded bytes cannot be negative']
    },
    compressedBytes: {
      type: Number,
      default: 0,
      min: [0, 'Compressed bytes cannot be negative']
    },
    compressionRatio: {
      type: Number,
      default: 0,
      min: [0, 'Compression ratio cannot be negative']
    }
  },

  // Network and Performance
  networkInfo: {
    type: {
      type: String,
      enum: ['wifi', 'cellular', 'ethernet', 'unknown'],
      default: 'unknown'
    },
    strength: {
      type: Number,
      min: [0, 'Signal strength cannot be negative'],
      max: [100, 'Signal strength cannot exceed 100']
    },
    latency: {
      type: Number, // in milliseconds
      min: [0, 'Latency cannot be negative']
    },
    bandwidth: {
      type: Number, // in Mbps
      min: [0, 'Bandwidth cannot be negative']
    }
  },

  // Error Information
  errors: [{
    timestamp: {
      type: Date,
      default: Date.now
    },
    code: {
      type: String,
      trim: true,
      maxlength: [50, 'Error code cannot exceed 50 characters']
    },
    message: {
      type: String,
      trim: true,
      maxlength: [500, 'Error message cannot exceed 500 characters']
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },
    dataType: {
      type: String,
      enum: ['activities', 'diagnoses', 'user_profile', 'preferences', 'clinical_records', 'media_files']
    },
    itemId: {
      type: String,
      trim: true
    },
    retryable: {
      type: Boolean,
      default: true
    },
    stack: {
      type: String,
      trim: true
    }
  }],

  // Conflict Resolution
  conflicts: [{
    itemId: {
      type: String,
      required: true,
      trim: true
    },
    dataType: {
      type: String,
      enum: ['activities', 'diagnoses', 'user_profile', 'preferences', 'clinical_records', 'media_files'],
      required: true
    },
    conflictType: {
      type: String,
      enum: ['version_mismatch', 'concurrent_modification', 'data_corruption', 'schema_mismatch'],
      required: true
    },
    resolution: {
      type: String,
      enum: ['server_wins', 'client_wins', 'merge', 'manual_review', 'skip'],
      default: 'manual_review'
    },
    resolvedAt: {
      type: Date,
      default: null
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    localVersion: {
      type: mongoose.Schema.Types.Mixed
    },
    serverVersion: {
      type: mongoose.Schema.Types.Mixed
    },
    mergedVersion: {
      type: mongoose.Schema.Types.Mixed
    }
  }],

  // Retry Information
  retryInfo: {
    attemptCount: {
      type: Number,
      default: 0,
      min: [0, 'Attempt count cannot be negative']
    },
    maxAttempts: {
      type: Number,
      default: 3,
      min: [1, 'Max attempts must be at least 1']
    },
    nextRetryAt: {
      type: Date,
      default: null
    },
    backoffMultiplier: {
      type: Number,
      default: 2,
      min: [1, 'Backoff multiplier must be at least 1']
    },
    lastRetryAt: {
      type: Date,
      default: null
    }
  },

  // Device and App Information
  deviceInfo: {
    platform: {
      type: String,
      enum: ['ios', 'android', 'web'],
      required: [true, 'Platform is required']
    },
    osVersion: {
      type: String,
      trim: true,
      maxlength: [20, 'OS version cannot exceed 20 characters']
    },
    appVersion: {
      type: String,
      trim: true,
      maxlength: [20, 'App version cannot exceed 20 characters']
    },
    availableStorage: {
      type: Number, // in MB
      min: [0, 'Available storage cannot be negative']
    },
    batteryLevel: {
      type: Number, // percentage
      min: [0, 'Battery level cannot be negative'],
      max: [100, 'Battery level cannot exceed 100']
    }
  },

  // Metadata and Additional Information
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot exceed 500 characters']
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: [50, 'Tag cannot exceed 50 characters']
  }],

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes for performance
syncLogSchema.index({ userId: 1, startedAt: -1 });
syncLogSchema.index({ deviceId: 1, startedAt: -1 });
syncLogSchema.index({ sessionId: 1 });
syncLogSchema.index({ status: 1, startedAt: -1 });
syncLogSchema.index({ syncType: 1, operation: 1 });
syncLogSchema.index({ startedAt: -1 });
syncLogSchema.index({ 'retryInfo.nextRetryAt': 1 });

// Compound indexes
syncLogSchema.index({ userId: 1, status: 1, startedAt: -1 });
syncLogSchema.index({ deviceId: 1, syncType: 1, startedAt: -1 });

// Pre-save middleware to calculate duration and update timestamps
syncLogSchema.pre('save', function(next) {
  if (this.completedAt && this.startedAt) {
    this.duration = this.completedAt.getTime() - this.startedAt.getTime();
  }
  
  if (this.progress.totalItems > 0) {
    this.progress.percentage = Math.round(
      (this.progress.processedItems / this.progress.totalItems) * 100
    );
  }
  
  this.updatedAt = Date.now();
  next();
});

// Instance method to mark sync as completed
syncLogSchema.methods.markCompleted = function(status = 'completed') {
  this.status = status;
  this.completedAt = new Date();
  this.duration = this.completedAt.getTime() - this.startedAt.getTime();
  return this.save();
};

// Instance method to add error
syncLogSchema.methods.addError = function(code, message, severity = 'medium', dataType = null, itemId = null, retryable = true, stack = null) {
  this.errors.push({
    code,
    message,
    severity,
    dataType,
    itemId,
    retryable,
    stack
  });
  return this.save();
};

// Instance method to add conflict
syncLogSchema.methods.addConflict = function(itemId, dataType, conflictType, localVersion, serverVersion) {
  this.conflicts.push({
    itemId,
    dataType,
    conflictType,
    localVersion,
    serverVersion
  });
  return this.save();
};

// Instance method to update progress
syncLogSchema.methods.updateProgress = function(processedItems, successfulItems = null, failedItems = null, skippedItems = null) {
  this.progress.processedItems = processedItems;
  if (successfulItems !== null) this.progress.successfulItems = successfulItems;
  if (failedItems !== null) this.progress.failedItems = failedItems;
  if (skippedItems !== null) this.progress.skippedItems = skippedItems;
  
  if (this.progress.totalItems > 0) {
    this.progress.percentage = Math.round(
      (this.progress.processedItems / this.progress.totalItems) * 100
    );
  }
  
  return this.save();
};

// Static method to get sync statistics
syncLogSchema.statics.getSyncStats = function(userId, startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        startedAt: {
          $gte: startDate,
          $lte: endDate
        }
      }
    },
    {
      $group: {
        _id: {
          status: '$status',
          syncType: '$syncType'
        },
        count: { $sum: 1 },
        avgDuration: { $avg: '$duration' },
        totalBytes: { $sum: { $add: ['$dataTransfer.uploadedBytes', '$dataTransfer.downloadedBytes'] } },
        lastSync: { $max: '$startedAt' }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);
};

module.exports = mongoose.model('SyncLog', syncLogSchema);
