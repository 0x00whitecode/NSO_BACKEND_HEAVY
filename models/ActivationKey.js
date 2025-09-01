const mongoose = require('mongoose');
const crypto = require('crypto');

const activationKeySchema = new mongoose.Schema({
  // Key Information
  key: {
    type: String,
    required: [true, 'Activation key is required'],
    unique: true,
    trim: true,
    uppercase: true,
    // 12-character activation key in XXXX-XXXX-XXXX format
    match: [/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i, 'Invalid activation key format']
  },
  keyHash: {
    type: String,
    required: [true, 'Key hash is required'],
    unique: true
  },

  // Assignment Information
  assignedTo: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    fullName: {
      type: String,
      trim: true,
      maxlength: [100, 'Full name cannot exceed 100 characters']
    },
    role: {
      type: String,
      enum: ['doctor', 'nurse', 'admin', 'technician', 'inspector', 'supervisor'],
      required: [true, 'Role is required']
    },
    facility: {
      type: String,
      trim: true,
      maxlength: [100, 'Facility name cannot exceed 100 characters']
    },
    state: {
      type: String,
      trim: true,
      maxlength: [50, 'State name cannot exceed 50 characters']
    }
  },

  // Status and Lifecycle
  status: {
    type: String,
    enum: ['pending', 'active', 'used', 'expired', 'revoked', 'suspended'],
    default: 'pending'
  },
  
  // Activation Information
  activatedAt: {
    type: Date,
    default: null
  },
  activatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  deviceId: {
    type: String,
    trim: true,
    default: null
  },
  deviceInfo: {
    platform: {
      type: String,
      enum: ['ios', 'android', 'web']
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
    },
    appVersion: {
      type: String,
      trim: true,
      maxlength: [20, 'App version cannot exceed 20 characters']
    }
  },

  // Validity and Expiration
  validFrom: {
    type: Date,
    default: Date.now
  },
  validUntil: {
    type: Date,
    required: [true, 'Expiration date is required'],
    validate: {
      validator: function(value) {
        return value > this.validFrom;
      },
      message: 'Expiration date must be after valid from date'
    }
  },
  maxUses: {
    type: Number,
    default: 1,
    min: [1, 'Max uses must be at least 1']
  },
  usageCount: {
    type: Number,
    default: 0,
    min: [0, 'Usage count cannot be negative']
  },

  // Security and Restrictions
  ipRestrictions: [{
    type: String,
    trim: true,
    match: [/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}(?:\/[0-9]{1,2})?$/, 'Invalid IP address format']
  }],
  locationRestrictions: {
    allowedStates: [{
      type: String,
      trim: true,
      maxlength: [50, 'State name cannot exceed 50 characters']
    }],
    allowedFacilities: [{
      type: String,
      trim: true,
      maxlength: [100, 'Facility name cannot exceed 100 characters']
    }],
    maxDistance: {
      type: Number,
      min: [0, 'Max distance cannot be negative']
    }, // in kilometers
    centerPoint: {
      latitude: Number,
      longitude: Number
    }
  },

  // Administrative Information
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Creator is required']
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  approvedAt: {
    type: Date,
    default: null
  },
  
  // Revocation Information
  revokedAt: {
    type: Date,
    default: null
  },
  revokedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  revocationReason: {
    type: String,
    trim: true,
    maxlength: [200, 'Revocation reason cannot exceed 200 characters']
  },

  // Usage Tracking
  usageHistory: [{
    timestamp: {
      type: Date,
      default: Date.now
    },
    action: {
      type: String,
      enum: ['created', 'activated', 'used', 'revoked', 'expired', 'suspended'],
      required: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    deviceId: {
      type: String,
      trim: true
    },
    ipAddress: {
      type: String,
      trim: true
    },
    location: {
      latitude: Number,
      longitude: Number,
      address: {
        type: String,
        trim: true,
        maxlength: [200, 'Address cannot exceed 200 characters']
      }
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  }],

  // Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot exceed 500 characters']
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
      delete ret.keyHash;
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes for performance
activationKeySchema.index({ key: 1 });
activationKeySchema.index({ keyHash: 1 });
activationKeySchema.index({ status: 1, validUntil: 1 });
activationKeySchema.index({ 'assignedTo.userId': 1 });
activationKeySchema.index({ 'assignedTo.email': 1 });
activationKeySchema.index({ createdBy: 1, createdAt: -1 });
activationKeySchema.index({ deviceId: 1 });
activationKeySchema.index({ validFrom: 1, validUntil: 1 });

// Compound indexes
activationKeySchema.index({ status: 1, createdAt: -1 });
activationKeySchema.index({ 'assignedTo.role': 1, status: 1 });

// Virtual for checking if key is expired
activationKeySchema.virtual('isExpired').get(function() {
  return this.validUntil < new Date();
});

// Virtual for checking if key is valid
activationKeySchema.virtual('isValid').get(function() {
  const now = new Date();
  return this.status === 'active' && 
         this.validFrom <= now && 
         this.validUntil > now && 
         this.usageCount < this.maxUses;
});

// Pre-save middleware to generate key hash
activationKeySchema.pre('save', function(next) {
  if (this.isModified('key')) {
    this.keyHash = crypto.createHash('sha256').update(this.key).digest('hex');
  }
  this.updatedAt = Date.now();
  next();
});

// Static method to generate a new activation key
activationKeySchema.statics.generateKey = function() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let key = '';

  for (let i = 0; i < 3; i++) {
    if (i > 0) key += '-';
    for (let j = 0; j < 4; j++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }

  return key;
};

// Static method to find by key
activationKeySchema.statics.findByKey = function(key) {
  const keyHash = crypto.createHash('sha256').update(key.toUpperCase()).digest('hex');
  return this.findOne({ keyHash });
};

// Instance method to add usage history
activationKeySchema.methods.addUsageHistory = function(action, userId, deviceId, ipAddress, location, metadata = {}) {
  this.usageHistory.push({
    action,
    userId,
    deviceId,
    ipAddress,
    location,
    metadata
  });
  return this.save();
};

// Instance method to activate key
activationKeySchema.methods.activate = function(userId, deviceId, deviceInfo, ipAddress, location) {
  this.status = 'used';
  this.activatedAt = new Date();
  this.activatedBy = userId;
  this.deviceId = deviceId;
  this.deviceInfo = deviceInfo;
  this.usageCount += 1;
  
  return this.addUsageHistory('activated', userId, deviceId, ipAddress, location);
};

// Instance method to revoke key
activationKeySchema.methods.revoke = function(revokedBy, reason) {
  this.status = 'revoked';
  this.revokedAt = new Date();
  this.revokedBy = revokedBy;
  this.revocationReason = reason;
  
  return this.addUsageHistory('revoked', revokedBy, null, null, null, { reason });
};

// Instance method to check if key can be activated
activationKeySchema.methods.canActivate = function() {
  const now = new Date();
  return this.status === 'active' && 
         this.validFrom <= now && 
         this.validUntil > now && 
         this.usageCount < this.maxUses;
};

// Instance method to get remaining days
activationKeySchema.methods.getRemainingDays = function() {
  const now = new Date();
  const diffTime = this.validUntil - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
};

module.exports = mongoose.model('ActivationKey', activationKeySchema);
