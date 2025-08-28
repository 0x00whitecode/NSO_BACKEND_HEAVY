const Activity = require('../models/Activity');

/**
 * Custom error classes
 */
class AppError extends Error {
  constructor(message, statusCode, code = null, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.timestamp = new Date();
    
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND_ERROR');
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT_ERROR');
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_ERROR');
  }
}

class DatabaseError extends AppError {
  constructor(message = 'Database operation failed') {
    super(message, 500, 'DATABASE_ERROR');
  }
}

class ExternalServiceError extends AppError {
  constructor(message = 'External service error') {
    super(message, 502, 'EXTERNAL_SERVICE_ERROR');
  }
}

/**
 * Error logging utility
 */
const logError = async (error, req = null, additionalInfo = {}) => {
  const errorLog = {
    timestamp: new Date(),
    message: error.message,
    stack: error.stack,
    code: error.code || 'UNKNOWN_ERROR',
    statusCode: error.statusCode || 500,
    ...additionalInfo
  };

  if (req) {
    errorLog.request = {
      method: req.method,
      url: req.originalUrl,
      headers: {
        'user-agent': req.headers['user-agent'],
        'x-forwarded-for': req.headers['x-forwarded-for'],
        'x-device-id': req.headers['x-device-id'],
        'x-session-id': req.headers['x-session-id']
      },
      body: req.method !== 'GET' ? req.body : undefined,
      query: req.query,
      params: req.params,
      userId: req.user?.id,
      deviceId: req.deviceId,
      sessionId: req.sessionId
    };
  }

  // Log to console
  console.error('Error occurred:', errorLog);

  // Log to database if we have user context
  if (req?.user && req?.deviceId) {
    try {
      const activity = new Activity({
        userId: req.user._id,
        deviceId: req.deviceId,
        sessionId: req.sessionId || req.headers['x-session-id'],
        activityType: 'error',
        error: {
          code: error.code || 'UNKNOWN_ERROR',
          message: error.message,
          severity: getSeverityFromStatusCode(error.statusCode),
          stack: error.stack
        },
        metadata: {
          request: errorLog.request,
          additionalInfo
        },
        timestamp: new Date()
      });
      
      await activity.save();
    } catch (dbError) {
      console.error('Failed to log error to database:', dbError);
    }
  }

  return errorLog;
};

/**
 * Get error severity from status code
 */
const getSeverityFromStatusCode = (statusCode) => {
  if (statusCode >= 500) return 'high';
  if (statusCode >= 400) return 'medium';
  return 'low';
};

/**
 * Handle different types of errors
 */
const handleCastError = (error) => {
  const message = `Invalid ${error.path}: ${error.value}`;
  return new ValidationError(message);
};

const handleDuplicateFieldsError = (error) => {
  const value = error.errmsg.match(/(["'])(\\?.)*?\1/)[0];
  const message = `Duplicate field value: ${value}. Please use another value!`;
  return new ConflictError(message);
};

const handleValidationError = (error) => {
  const errors = Object.values(error.errors).map(el => el.message);
  const message = `Invalid input data. ${errors.join('. ')}`;
  return new ValidationError(message, errors);
};

const handleJWTError = () => {
  return new AuthenticationError('Invalid token. Please log in again!');
};

const handleJWTExpiredError = () => {
  return new AuthenticationError('Your token has expired! Please log in again.');
};

/**
 * Send error response to client
 */
const sendErrorResponse = (error, req, res) => {
  const { statusCode = 500, message, code } = error;
  
  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  const errorResponse = {
    success: false,
    error: message,
    code: code || 'INTERNAL_SERVER_ERROR',
    timestamp: new Date().toISOString()
  };

  // Add stack trace in development
  if (isDevelopment) {
    errorResponse.stack = error.stack;
    errorResponse.details = error.details;
  }

  // Add request ID if available
  if (req.requestId) {
    errorResponse.requestId = req.requestId;
  }

  res.status(statusCode).json(errorResponse);
};

/**
 * Global error handling middleware
 */
const globalErrorHandler = async (error, req, res, next) => {
  let err = { ...error };
  err.message = error.message;

  // Log error
  await logError(error, req);

  // Handle specific error types
  if (error.name === 'CastError') err = handleCastError(err);
  if (error.code === 11000) err = handleDuplicateFieldsError(err);
  if (error.name === 'ValidationError') err = handleValidationError(err);
  if (error.name === 'JsonWebTokenError') err = handleJWTError();
  if (error.name === 'TokenExpiredError') err = handleJWTExpiredError();

  // Send error response
  sendErrorResponse(err, req, res);
};

/**
 * Handle async errors in route handlers
 */
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

/**
 * Handle 404 errors
 */
const handleNotFound = (req, res, next) => {
  const error = new NotFoundError(`Route ${req.originalUrl} not found`);
  next(error);
};

/**
 * Validate required environment variables
 */
const validateEnvironment = () => {
  const required = [
    'NODE_ENV',
    'PORT',
    'MONGODB_URL',
    'JWT_SECRET'
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};

/**
 * Handle uncaught exceptions
 */
const handleUncaughtException = () => {
  process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
    console.error(err.name, err.message);
    console.error(err.stack);
    process.exit(1);
  });
};

/**
 * Handle unhandled promise rejections
 */
const handleUnhandledRejection = () => {
  process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED REJECTION! 💥 Shutting down...');
    console.error(err.name, err.message);
    console.error(err.stack);
    process.exit(1);
  });
};

/**
 * Setup error handling
 */
const setupErrorHandling = () => {
  validateEnvironment();
  handleUncaughtException();
  handleUnhandledRejection();
};

module.exports = {
  // Error classes
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  DatabaseError,
  ExternalServiceError,
  
  // Error handling functions
  logError,
  globalErrorHandler,
  catchAsync,
  handleNotFound,
  setupErrorHandling,
  sendErrorResponse
};
