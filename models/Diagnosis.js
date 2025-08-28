const mongoose = require('mongoose');

const diagnosisSchema = new mongoose.Schema({
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

  // Patient Information
  patient: {
    id: {
      type: String,
      trim: true,
      maxlength: [50, 'Patient ID cannot exceed 50 characters']
    },
    name: {
      type: String,
      trim: true,
      maxlength: [100, 'Patient name cannot exceed 100 characters']
    },
    age: {
      type: Number,
      min: [0, 'Age cannot be negative'],
      max: [150, 'Age cannot exceed 150']
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other', 'not_specified'],
      default: 'not_specified'
    },
    contact: {
      type: String,
      trim: true,
      maxlength: [100, 'Contact info cannot exceed 100 characters']
    }
  },

  // Clinical Information
  complaint: {
    primary: {
      type: String,
      required: [true, 'Primary complaint is required'],
      trim: true,
      maxlength: [500, 'Primary complaint cannot exceed 500 characters']
    },
    secondary: [{
      type: String,
      trim: true,
      maxlength: [200, 'Secondary complaint cannot exceed 200 characters']
    }],
    duration: {
      type: String,
      trim: true,
      maxlength: [100, 'Duration cannot exceed 100 characters']
    },
    severity: {
      type: String,
      enum: ['mild', 'moderate', 'severe', 'critical'],
      default: 'moderate'
    }
  },

  // Symptoms and Signs
  symptoms: [{
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: [100, 'Symptom name cannot exceed 100 characters']
    },
    present: {
      type: Boolean,
      default: true
    },
    severity: {
      type: String,
      enum: ['mild', 'moderate', 'severe'],
      default: 'moderate'
    },
    duration: {
      type: String,
      trim: true,
      maxlength: [50, 'Duration cannot exceed 50 characters']
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [200, 'Notes cannot exceed 200 characters']
    }
  }],

  // Vital Signs
  vitals: {
    temperature: {
      value: Number,
      unit: {
        type: String,
        enum: ['celsius', 'fahrenheit'],
        default: 'celsius'
      }
    },
    bloodPressure: {
      systolic: Number,
      diastolic: Number,
      unit: {
        type: String,
        default: 'mmHg'
      }
    },
    heartRate: {
      value: Number,
      unit: {
        type: String,
        default: 'bpm'
      }
    },
    respiratoryRate: {
      value: Number,
      unit: {
        type: String,
        default: 'breaths/min'
      }
    },
    oxygenSaturation: {
      value: Number,
      unit: {
        type: String,
        default: '%'
      }
    },
    weight: {
      value: Number,
      unit: {
        type: String,
        enum: ['kg', 'lbs'],
        default: 'kg'
      }
    },
    height: {
      value: Number,
      unit: {
        type: String,
        enum: ['cm', 'inches'],
        default: 'cm'
      }
    }
  },

  // Diagnosis Information
  diagnosis: {
    primary: {
      code: {
        type: String,
        trim: true,
        maxlength: [20, 'Diagnosis code cannot exceed 20 characters']
      },
      description: {
        type: String,
        trim: true,
        maxlength: [200, 'Diagnosis description cannot exceed 200 characters']
      },
      confidence: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
      }
    },
    differential: [{
      code: {
        type: String,
        trim: true,
        maxlength: [20, 'Diagnosis code cannot exceed 20 characters']
      },
      description: {
        type: String,
        trim: true,
        maxlength: [200, 'Diagnosis description cannot exceed 200 characters']
      },
      probability: {
        type: Number,
        min: [0, 'Probability cannot be negative'],
        max: [100, 'Probability cannot exceed 100']
      }
    }]
  },

  // Treatment and Recommendations
  treatment: {
    medications: [{
      name: {
        type: String,
        trim: true,
        maxlength: [100, 'Medication name cannot exceed 100 characters']
      },
      dosage: {
        type: String,
        trim: true,
        maxlength: [50, 'Dosage cannot exceed 50 characters']
      },
      frequency: {
        type: String,
        trim: true,
        maxlength: [50, 'Frequency cannot exceed 50 characters']
      },
      duration: {
        type: String,
        trim: true,
        maxlength: [50, 'Duration cannot exceed 50 characters']
      }
    }],
    procedures: [{
      name: {
        type: String,
        trim: true,
        maxlength: [100, 'Procedure name cannot exceed 100 characters']
      },
      description: {
        type: String,
        trim: true,
        maxlength: [200, 'Procedure description cannot exceed 200 characters']
      },
      urgency: {
        type: String,
        enum: ['routine', 'urgent', 'emergency'],
        default: 'routine'
      }
    }],
    recommendations: [{
      type: String,
      trim: true,
      maxlength: [200, 'Recommendation cannot exceed 200 characters']
    }],
    followUp: {
      required: {
        type: Boolean,
        default: false
      },
      timeframe: {
        type: String,
        trim: true,
        maxlength: [50, 'Follow-up timeframe cannot exceed 50 characters']
      },
      specialist: {
        type: String,
        trim: true,
        maxlength: [100, 'Specialist cannot exceed 100 characters']
      }
    }
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
      enum: ['hospital', 'clinic', 'pharmacy', 'laboratory', 'field', 'other'],
      default: 'other'
    }
  },

  // Status and Workflow
  status: {
    type: String,
    enum: ['draft', 'in_progress', 'completed', 'reviewed', 'archived'],
    default: 'draft'
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },

  // Sync Information
  syncStatus: {
    type: String,
    enum: ['pending', 'synced', 'failed', 'conflict'],
    default: 'pending'
  },
  syncedAt: {
    type: Date
  },
  syncAttempts: {
    type: Number,
    default: 0
  },
  lastModified: {
    type: Date,
    default: Date.now
  },

  // Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

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
diagnosisSchema.index({ userId: 1, createdAt: -1 });
diagnosisSchema.index({ deviceId: 1, createdAt: -1 });
diagnosisSchema.index({ sessionId: 1 });
diagnosisSchema.index({ status: 1, createdAt: -1 });
diagnosisSchema.index({ syncStatus: 1 });
diagnosisSchema.index({ 'location.facility': 1 });
diagnosisSchema.index({ 'patient.id': 1 });
diagnosisSchema.index({ priority: 1, status: 1 });

// Compound indexes
diagnosisSchema.index({ userId: 1, status: 1, createdAt: -1 });
diagnosisSchema.index({ deviceId: 1, syncStatus: 1 });

// Pre-save middleware to update lastModified
diagnosisSchema.pre('save', function(next) {
  this.lastModified = Date.now();
  next();
});

// Static method to get diagnosis statistics
diagnosisSchema.statics.getDiagnosisStats = function(userId, startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        createdAt: {
          $gte: startDate,
          $lte: endDate
        }
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        lastDiagnosis: { $max: '$createdAt' }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);
};

module.exports = mongoose.model('Diagnosis', diagnosisSchema);
