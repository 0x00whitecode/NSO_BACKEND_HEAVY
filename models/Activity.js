const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  // User Information
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

  // Activity Details
  activityType: {
    type: String,
    enum: [
      // System Activities
      'login', 'logout', 'screen_view', 'button_click', 'form_submit',
      'sync_start', 'sync_complete', 'error', 'performance', 'location_update', 'facility_visit',

      // Medical Activities
      'diagnosis_start', 'diagnosis_complete', 'diagnosis_update', 'diagnosis_review',
      'clinical_decision_support', 'clinical_record_access', 'clinical_guideline_view',
      'patient_assessment', 'patient_data_entry', 'patient_data_update',

      // Neonatal Care Activities
      'neonatal_care_start', 'neonatal_assessment', 'neonatal_intervention',
      'newborn_screening', 'immediate_newborn_care', 'neonatal_emergency',

      // Clinical Support Activities
      'medication_lookup', 'dosage_calculation', 'treatment_recommendation',
      'referral_initiated', 'follow_up_scheduled', 'health_education_provided',

      // Form Interactions
      'form_interaction', 'symptom_selection', 'vital_signs_entry',
      'clinical_findings_entry', 'treatment_plan_creation'
    ],
    required: [true, 'Activity type is required']
  },
  
  // Screen Information
  screenName: {
    type: String,
    trim: true,
    maxlength: [100, 'Screen name cannot exceed 100 characters']
  },
  route: {
    type: String,
    trim: true,
    maxlength: [200, 'Route cannot exceed 200 characters']
  },

  // Action Details
  action: {
    name: {
      type: String,
      trim: true,
      maxlength: [100, 'Action name cannot exceed 100 characters']
    },
    target: {
      type: String,
      trim: true,
      maxlength: [100, 'Action target cannot exceed 100 characters']
    },
    value: mongoose.Schema.Types.Mixed
  },

  // Location Information
  location: {
    latitude: Number,
    longitude: Number,
    accuracy: Number,
    address: {
      type: String,
      trim: true,
      maxlength: [200, 'Address cannot exceed 200 characters']
    },
    facility: {
      type: String,
      trim: true,
      maxlength: [100, 'Facility name cannot exceed 100 characters']
    },
    facilityType: {
      type: String,
      enum: ['hospital', 'clinic', 'pharmacy', 'laboratory', 'other'],
      default: 'other'
    }
  },

  // Performance Metrics
  performance: {
    duration: Number, // in milliseconds
    loadTime: Number, // in milliseconds
    memoryUsage: Number, // in MB
    networkLatency: Number, // in milliseconds
    batteryLevel: Number // percentage
  },

  // Error Information
  error: {
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
    stack: {
      type: String,
      trim: true
    }
  },

  // Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Medical Context (for medical activities)
  medicalContext: {
    patientId: {
      type: String,
      trim: true
    },
    patientAge: {
      type: String,
      trim: true
    },
    patientGender: {
      type: String,
      enum: ['male', 'female', 'other', 'unknown'],
      default: 'unknown'
    },
    chiefComplaint: {
      type: String,
      trim: true,
      maxlength: [500, 'Chief complaint cannot exceed 500 characters']
    },
    diagnosisId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Diagnosis'
    },
    clinicalRecordId: {
      type: String,
      trim: true
    },
    severity: {
      type: String,
      enum: ['routine', 'moderate', 'severe', 'critical', 'emergency'],
      default: 'routine'
    },
    category: {
      type: String,
      trim: true,
      maxlength: [100, 'Category cannot exceed 100 characters']
    },
    ageGroup: {
      type: String,
      enum: [
        'neonate', 'infant', 'toddler', 'preschool', 'school_age',
        'adolescent', 'adult', 'elderly', 'unknown'
      ],
      default: 'unknown'
    },
    medicalSystem: {
      type: String,
      trim: true,
      maxlength: [100, 'Medical system cannot exceed 100 characters']
    },
    interventionType: {
      type: String,
      enum: [
        'assessment', 'diagnosis', 'treatment', 'medication', 'referral',
        'education', 'monitoring', 'emergency_care', 'preventive_care'
      ]
    },
    outcome: {
      type: String,
      enum: ['improved', 'stable', 'deteriorated', 'referred', 'discharged', 'unknown'],
      default: 'unknown'
    }
  },

  // Clinical Context (for decision support activities)
  clinicalContext: {
    recommendationId: {
      type: String,
      trim: true
    },
    matchScore: {
      type: Number,
      min: 0,
      max: 100
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1
    },
    guidelineSource: {
      type: String,
      trim: true,
      maxlength: [200, 'Guideline source cannot exceed 200 characters']
    },
    followUpRequired: {
      type: Boolean,
      default: false
    },
    urgencyLevel: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'low'
    }
  },

  // Device Information
  deviceInfo: {
    platform: {
      type: String,
      enum: ['ios', 'android', 'web'],
      required: [true, 'Platform is required']
    },
    version: {
      type: String,
      trim: true,
      maxlength: [20, 'Version cannot exceed 20 characters']
    },
    model: {
      type: String,
      trim: true,
      maxlength: [50, 'Model cannot exceed 50 characters']
    },
    osVersion: {
      type: String,
      trim: true,
      maxlength: [20, 'OS version cannot exceed 20 characters']
    }
  },

  // Network Information
  networkInfo: {
    type: {
      type: String,
      enum: ['wifi', 'cellular', 'ethernet', 'unknown'],
      default: 'unknown'
    },
    isConnected: {
      type: Boolean,
      default: true
    },
    strength: Number // signal strength percentage
  },

  // Sync Status
  syncStatus: {
    type: String,
    enum: ['pending', 'synced', 'failed'],
    default: 'pending'
  },
  syncedAt: {
    type: Date
  },
  syncAttempts: {
    type: Number,
    default: 0
  },

  // Timestamps
  timestamp: {
    type: Date,
    default: Date.now,
    required: [true, 'Timestamp is required']
  },
  createdAt: {
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
activitySchema.index({ userId: 1, timestamp: -1 });
activitySchema.index({ deviceId: 1, timestamp: -1 });
activitySchema.index({ sessionId: 1, timestamp: -1 });
activitySchema.index({ activityType: 1, timestamp: -1 });
activitySchema.index({ syncStatus: 1 });
activitySchema.index({ 'location.facility': 1 });
activitySchema.index({ timestamp: -1 });

// Compound indexes
activitySchema.index({ userId: 1, activityType: 1, timestamp: -1 });
activitySchema.index({ deviceId: 1, syncStatus: 1 });

// Static method to get activity statistics
activitySchema.statics.getActivityStats = function(userId, startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        timestamp: {
          $gte: startDate,
          $lte: endDate
        }
      }
    },
    {
      $group: {
        _id: '$activityType',
        count: { $sum: 1 },
        lastActivity: { $max: '$timestamp' }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);
};

// Static method to get error statistics
activitySchema.statics.getErrorStats = function(startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        activityType: 'error',
        timestamp: {
          $gte: startDate,
          $lte: endDate
        }
      }
    },
    {
      $group: {
        _id: {
          code: '$error.code',
          severity: '$error.severity'
        },
        count: { $sum: 1 },
        lastOccurrence: { $max: '$timestamp' },
        users: { $addToSet: '$userId' }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);
};

module.exports = mongoose.model('Activity', activitySchema);
