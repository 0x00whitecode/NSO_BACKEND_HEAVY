require('dotenv').config();

const config = {
  // Server Configuration
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // Database Configuration
  MONGODB_URL: process.env.MONGODB_URL || 'mongodb://localhost:27017/nso_db',
  
  // JWT Configuration
  JWT_SECRET: process.env.JWT_SECRET || 'nso_jwt_secret_key_change_in_production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
  
  // Rate Limiting
  RATE_LIMIT_WINDOW: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: 100,
  
  // API Configuration
  API_VERSION: '/api/v1',
  
  // Timeout Configuration
  REQUEST_TIMEOUT: 30000, // 30 seconds
  ACTIVATION_TIMEOUT: 60000, // 60 seconds for activation requests
  SYNC_TIMEOUT: 120000, // 2 minutes for sync operations
  
  // Encryption
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || 'nso_encryption_key_32_chars_long',
  
  // File Upload
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  UPLOAD_PATH: './uploads',
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_FILE: process.env.LOG_FILE || './logs/app.log'
};

module.exports = config;
