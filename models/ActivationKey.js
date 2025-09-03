const mongoose = require('mongoose');
const crypto = require('crypto');

const activationKeySchema = new mongoose.Schema({
  // Key Information - 12-digit numeric key
  key: {
    type: String,
    required: [true, 'Activation key is required'],
    unique: true,
    trim: true,
    // 12-digit numeric key
    match: [/^\d{12}$/, 'Invalid activation key format - must be 12 digits']
  },
  keyHash: {
    type: String,
    required: [true, 'Key hash is required'],
    unique: true
  },

  // Encrypted user data for offline validation
  encryptedUserData: {
    type: String,
    required: [true, 'Encrypted user data is required']
  },

  // User details for admin management (plain text)
  userDetails: {
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      maxlength: [100, 'Full name cannot exceed 100 characters']
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Invalid email format']
    },
    phone: {
      type: String,
      trim: true,
      maxlength: [20, 'Phone number cannot exceed 20 characters']
    },
    role: {
      type: String,
      required: [true, 'Role is required'],
      enum: ['doctor', 'nurse', 'admin', 'technician', 'inspector', 'supervisor'],
      trim: true
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
    enum: ['unused', 'used', 'expired', 'revoked'],
    default: 'unused'
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    required: [true, 'Expiration date is required']
  },
  usedAt: {
    type: Date,
    default: null
  },

  // Administrative Information
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Creator is required']
  },

  // Notes (optional)
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot exceed 500 characters']
  },

  // Revocation Information (for revoked keys)
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
  }
}, {
  timestamps: true, // Automatically adds createdAt and updatedAt
  toJSON: {
    transform: function(doc, ret) {
      delete ret.keyHash;
      delete ret.encryptedUserData; // Don't expose encrypted data in JSON
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes for performance
activationKeySchema.index({ key: 1 });
activationKeySchema.index({ keyHash: 1 });
activationKeySchema.index({ status: 1, expiresAt: 1 });
activationKeySchema.index({ 'userDetails.email': 1 });
activationKeySchema.index({ createdBy: 1, createdAt: -1 });

// Compound indexes
activationKeySchema.index({ status: 1, createdAt: -1 });
activationKeySchema.index({ 'userDetails.role': 1, status: 1 });

// Virtual for checking if key is expired
activationKeySchema.virtual('isExpired').get(function() {
  return this.expiresAt < new Date();
});

// Virtual for checking if key is valid
activationKeySchema.virtual('isValid').get(function() {
  const now = new Date();
  return this.status === 'unused' && this.expiresAt > now;
});
// Ensure keyHash is present before validation
activationKeySchema.pre('validate', function(next) {
  if ((this.isModified('key') || this.isNew) && this.key) {
    this.keyHash = crypto.createHash('sha256').update(this.key).digest('hex');
  }
  next();
});


// Pre-save middleware to generate key hash and handle expiration
activationKeySchema.pre('save', function(next) {
  if (this.isModified('key')) {
    this.keyHash = crypto.createHash('sha256').update(this.key).digest('hex');
  }

  // Auto-expire keys that are past expiration date
  if (this.expiresAt < new Date() && this.status === 'unused') {
    this.status = 'expired';
  }

  next();
});

// Static method to generate a new 12-digit activation key
activationKeySchema.statics.generateKey = function() {
  // Generate 12 random digits
  let key = '';
  for (let i = 0; i < 12; i++) {
    key += Math.floor(Math.random() * 10).toString();
  }
  return key;
};

// Static method to generate encrypted user data for offline validation
activationKeySchema.statics.encryptUserData = function(userData, key) {
  // Derive 32-byte key from secret to match mobile app's decryption
  const SECRET = process.env.ACTIVATION_KEY_SECRET || 'nso-activation-key-2024';
  const derivedKey = Buffer.from(SECRET.padEnd(32, '0').slice(0, 32), 'utf8');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', derivedKey, iv);
  const json = JSON.stringify(userData);
  let encrypted = cipher.update(json, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  // Prefix IV (hex) to the encrypted payload to align with mobile
  return iv.toString('hex') + encrypted;
};

// Static method to find by key
activationKeySchema.statics.findByKey = function(key) {
  const keyHash = crypto.createHash('sha256').update(key).digest('hex');
  return this.findOne({ keyHash });
};

// Static method to decrypt user data for validation
activationKeySchema.statics.decryptUserData = function(encryptedData, key) {
  try {
    const SECRET = process.env.ACTIVATION_KEY_SECRET || 'nso-activation-key-2024';
    const derivedKey = Buffer.from(SECRET.padEnd(32, '0').slice(0, 32), 'utf8');
    // Extract IV (first 32 hex chars -> 16 bytes)
    const ivHex = encryptedData.slice(0, 32);
    const payloadHex = encryptedData.slice(32);
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', derivedKey, iv);
    let decrypted = decipher.update(payloadHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  } catch (error) {
    return null;
  }
};

// Instance method to use/activate key
activationKeySchema.methods.use = function() {
  this.status = 'used';
  this.usedAt = new Date();
  return this.save();
};

// Instance method to revoke key
activationKeySchema.methods.revoke = function(revokedBy, reason) {
  this.status = 'revoked';
  this.revokedAt = new Date();
  this.revokedBy = revokedBy;
  this.revocationReason = reason;
  return this.save();
};

// Instance method to check if key can be used
activationKeySchema.methods.canUse = function() {
  const now = new Date();
  return this.status === 'unused' && this.expiresAt > now;
};

// Instance method to get remaining days
activationKeySchema.methods.getRemainingDays = function() {
  const now = new Date();
  const diffTime = this.expiresAt - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
};

module.exports = mongoose.model('ActivationKey', activationKeySchema);
