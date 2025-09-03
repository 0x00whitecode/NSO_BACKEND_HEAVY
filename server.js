const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const config = require('./config');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const activityRoutes = require('./routes/activity');
const syncRoutes = require('./routes/sync');
const diagnosisRoutes = require('./routes/diagnosis');
const adminRoutes = require('./routes/admin');

// Import middleware and utilities
const { globalErrorHandler, handleNotFound, setupErrorHandling } = require('./utils/errorHandler');

// Setup error handling
setupErrorHandling();

const app = express();
const PORT = config.PORT;

// Basic security middleware
app.use(helmet());

// Ultra-permissive CORS for admin and mobile clients
app.use(cors({
  origin: '*',
  methods: '*',
  allowedHeaders: '*',
  exposedHeaders: '*',
  credentials: false,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));
// Ensure preflight requests are handled for all routes
app.options('*', cors());

app.use(compression());

// Request logging
app.use(morgan('combined'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint with database status
app.get('/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.NODE_ENV,
    database: dbStatus
  });
});

// Basic API info endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'NSO Backend API',
    version: '1.0.0',
    description: 'NSO Mobile App Backend - Data Sync and User Activity Tracking',
    endpoints: {
      health: '/health',
      api: '/api',
      auth: '/api/v1/auth',
      users: '/api/v1/users',
      activity: '/api/v1/activity',
      sync: '/api/v1/sync',
      diagnosis: '/api/v1/diagnosis',
      admin: '/api/v1/admin'
    }
  });
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/activity', activityRoutes);
app.use('/api/v1/sync', syncRoutes);
app.use('/api/v1/diagnosis', diagnosisRoutes);
app.use('/api/v1/admin', adminRoutes);

// 404 handler
app.use('*', handleNotFound);

// Global error handler
app.use(globalErrorHandler);

// Database connection
const connectToDatabase = async () => {
  try {
    console.log('Connecting to MongoDB...');
    console.log('Connection string:', config.MONGODB_URL.replace(/:[^:@]*@/, ':****@'));

    await mongoose.connect(config.MONGODB_URL, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });

    console.log('✅ Connected to MongoDB successfully');

    // Test the connection with a ping
    const adminDb = mongoose.connection.db.admin();
    const result = await adminDb.ping();
    console.log('✅ Database ping successful:', result);

    return true;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    console.warn('⚠️  Server will continue running without database connection');
    return false;
  }
};



// Start server
const startServer = async () => {
  // Attempt database connection
  const dbConnected = await connectToDatabase();

  app.listen(PORT, () => {
    console.log(`🚀 NSO Backend Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`📋 API info: http://localhost:${PORT}/api`);
    console.log(`🌍 Environment: ${config.NODE_ENV}`);
    console.log(`💾 Database: ${dbConnected ? 'Connected' : 'Disconnected'}`);
  });
};

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  mongoose.connection.close(() => {
    console.log('MongoDB connection closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  mongoose.connection.close(() => {
    console.log('MongoDB connection closed');
    process.exit(0);
  });
});

startServer();

module.exports = app;
