const Activity = require('../models/Activity');

/**
 * Custom error class for API errors
 */
class APIError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Custom error class for validation errors
 */
class ValidationError extends APIError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

/**
 * Custom error class for authentication errors
 */
class AuthenticationError extends APIError {
  constructor(message = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
    this.name = 'AuthenticationError';
  }
}

/**
 * Custom error class for authorization errors
 */
class AuthorizationError extends APIError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
    this.name = 'AuthorizationError';
  }
}

/**
 * Custom error class for not found errors
 */
class NotFoundError extends APIError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND_ERROR');
    this.name = 'NotFoundError';
  }
}

/**
 * Custom error class for conflict errors
 */
class ConflictError extends APIError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT_ERROR');
    this.name = 'ConflictError';
  }
}

/**
 * Custom error class for rate limit errors
 */
class RateLimitError extends APIError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_ERROR');
    this.name = 'RateLimitError';
  }
}

/**
 * Handle MongoDB/Mongoose errors
 */
const handleMongoError = (error) => {
  if (error.name === 'ValidationError') {
    const details = Object.values(error.errors).map(err => ({
      field: err.path,
      message: err.message,
      value: err.value
    }));
    return new ValidationError('Validation failed', details);
  }
  
  if (error.name === 'CastError') {
    return new ValidationError(`Invalid ${error.path}: ${error.value}`);
  }
  
  if (error.code === 11000) {
    const field = Object.keys(error.keyValue)[0];
    const value = error.keyValue[field];
    return new ConflictError(`${field} '${value}' already exists`);
  }
  
  if (error.name === 'MongoNetworkError') {
    return new APIError('Database connection error', 503, 'DATABASE_ERROR');
  }
  
  return error;
};

/**
 * Handle JWT errors
 */
const handleJWTError = (error) => {
  if (error.name === 'JsonWebTokenError') {
    return new AuthenticationError('Invalid token');
  }
  
  if (error.name === 'TokenExpiredError') {
    return new AuthenticationError('Token expired');
  }
  
  if (error.name === 'NotBeforeError') {
    return new AuthenticationError('Token not active');
  }
  
  return error;
};

/**
 * Log error to database
 */
const logErrorToDatabase = async (error, req) => {
  try {
    if (!req.user || !req.deviceId) return;
    
    const activity = new Activity({
      userId: req.user._id,
      deviceId: req.deviceId,
      sessionId: req.headers['x-session-id'] || 'unknown',
      activityType: 'error',
      error: {
        code: error.code || 'UNKNOWN_ERROR',
        message: error.message,
        severity: error.statusCode >= 500 ? 'high' : 'medium',
        stack: error.stack
      },
      metadata: {
        url: req.originalUrl,
        method: req.method,
        userAgent: req.headers['user-agent'],
        ip: req.ip
      },
      timestamp: new Date()
    });
    
    await activity.save();
  } catch (logError) {
    console.error('Failed to log error to database:', logError);
  }
};

/**
 * Main error handling middleware
 */
const errorHandler = async (error, req, res, next) => {
  let err = error;
  
  // Handle specific error types
  if (err.name === 'ValidationError' || err.name === 'CastError' || err.code === 11000 || err.name === 'MongoNetworkError') {
    err = handleMongoError(err);
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError' || err.name === 'NotBeforeError') {
    err = handleJWTError(err);
  }
  
  // Set default values for unknown errors
  if (!err.statusCode) {
    err.statusCode = 500;
  }
  
  if (!err.code) {
    err.code = 'INTERNAL_ERROR';
  }
  
  // Log error
  console.error('Error occurred:', {
    message: err.message,
    code: err.code,
    statusCode: err.statusCode,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    user: req.user?.username || 'anonymous',
    timestamp: new Date().toISOString()
  });
  
  // Log error to database for authenticated users
  if (req.user && err.statusCode >= 400) {
    await logErrorToDatabase(err, req);
  }
  
  // Prepare error response
  const errorResponse = {
    success: false,
    error: err.message,
    code: err.code,
    timestamp: new Date().toISOString()
  };
  
  // Add details for validation errors
  if (err.details) {
    errorResponse.details = err.details;
  }
  
  // Add stack trace in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
  }
  
  // Send error response
  res.status(err.statusCode).json(errorResponse);
};

/**
 * Handle 404 errors (route not found)
 */
const notFoundHandler = (req, res, next) => {
  const error = new NotFoundError(`Route ${req.originalUrl} not found`);
  next(error);
};

/**
 * Async error wrapper to catch errors in async route handlers
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Validation error handler for express-validator
 */
const validationErrorHandler = (errors) => {
  const details = errors.array().map(error => ({
    field: error.path,
    message: error.msg,
    value: error.value
  }));
  
  return new ValidationError('Validation failed', details);
};

/**
 * Rate limit error handler
 */
const rateLimitHandler = (req, res, next) => {
  const error = new RateLimitError('Too many requests, please try again later');
  next(error);
};

/**
 * CORS error handler
 */
const corsErrorHandler = (req, res, next) => {
  const error = new AuthorizationError('CORS policy violation');
  next(error);
};

/**
 * File upload error handler
 */
const fileUploadErrorHandler = (error, req, res, next) => {
  if (error.code === 'LIMIT_FILE_SIZE') {
    const err = new ValidationError('File too large');
    return next(err);
  }
  
  if (error.code === 'LIMIT_FILE_COUNT') {
    const err = new ValidationError('Too many files');
    return next(err);
  }
  
  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    const err = new ValidationError('Unexpected file field');
    return next(err);
  }
  
  next(error);
};

/**
 * Database connection error handler
 */
const databaseErrorHandler = (error) => {
  console.error('Database connection error:', error);
  return new APIError('Database service unavailable', 503, 'DATABASE_UNAVAILABLE');
};

module.exports = {
  APIError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  errorHandler,
  notFoundHandler,
  asyncHandler,
  validationErrorHandler,
  rateLimitHandler,
  corsErrorHandler,
  fileUploadErrorHandler,
  databaseErrorHandler,
  handleMongoError,
  handleJWTError,
  logErrorToDatabase
};
