const { body, param, query, validationResult } = require('express-validator');

/**
 * Middleware to handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: errors.array().map(error => ({
        field: error.path,
        message: error.msg,
        value: error.value
      }))
    });
  }
  
  next();
};

/**
 * Validation rules for user activation
 */
const validateActivation = [
  body('activationKey')
    .notEmpty()
    .withMessage('Activation key is required')
    .matches(/^\d{12}$/)
    .withMessage('Invalid activation key format - must be 12 digits'),
  
  body('userInfo.fullName')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters'),
  
  body('userInfo.role')
    .optional()
    .isIn(['doctor', 'nurse', 'admin', 'technician', 'inspector', 'supervisor'])
    .withMessage('Invalid role'),
  
  body('userInfo.facility')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Facility name cannot exceed 100 characters'),
  
  body('userInfo.state')
    .optional()
    .isLength({ max: 50 })
    .withMessage('State name cannot exceed 50 characters'),
  
  body('userInfo.contactInfo')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Contact info cannot exceed 100 characters'),
  
  body('deviceId')
    .notEmpty()
    .withMessage('Device ID is required'),
  
  body('deviceInfo.platform')
    .notEmpty()
    .withMessage('Platform is required')
    .isIn(['ios', 'android', 'web'])
    .withMessage('Invalid platform'),
  
  handleValidationErrors
];

/**
 * Validation rules for user login
 */
const validateLogin = [
  body('activationKey')
    .notEmpty()
    .withMessage('Activation key is required')
    .matches(/^\d{12}$/)
    .withMessage('Invalid activation key format - must be 12 digits'),
  
  body('deviceId')
    .notEmpty()
    .withMessage('Device ID is required'),
  
  handleValidationErrors
];

/**
 * Validation rules for activity tracking
 */
const validateActivity = [
  body('activityType')
    .notEmpty()
    .withMessage('Activity type is required')
    .isIn([
      // System
      'login', 'logout', 'screen_view', 'button_click', 'form_submit',
      'sync_start', 'sync_complete', 'error', 'performance', 'location_update', 'facility_visit',
      // Medical
      'diagnosis_start', 'diagnosis_complete', 'diagnosis_update', 'diagnosis_review',
      'clinical_decision_support', 'clinical_record_access', 'clinical_guideline_view',
      'patient_assessment', 'patient_data_entry', 'patient_data_update',
      // Neonatal
      'neonatal_care_start', 'neonatal_assessment', 'neonatal_intervention',
      'newborn_screening', 'immediate_newborn_care', 'neonatal_emergency',
      // Clinical Support
      'medication_lookup', 'dosage_calculation', 'treatment_recommendation',
      'referral_initiated', 'follow_up_scheduled', 'health_education_provided',
      // Form
      'form_interaction', 'symptom_selection', 'vital_signs_entry',
      'clinical_findings_entry', 'treatment_plan_creation'
    ])
    .withMessage('Invalid activity type'),
  
  body('sessionId')
    .notEmpty()
    .withMessage('Session ID is required'),
  
  body('timestamp')
    .optional()
    .isISO8601()
    .withMessage('Invalid timestamp format'),
  
  body('deviceInfo.platform')
    .notEmpty()
    .withMessage('Platform is required')
    .isIn(['ios', 'android', 'web'])
    .withMessage('Invalid platform'),
  
  handleValidationErrors
];

/**
 * Validation rules for batch activity tracking
 */
const validateBatchActivity = [
  body('activities')
    .isArray({ min: 1, max: 100 })
    .withMessage('Activities must be an array with 1-100 items'),
  
  body('activities.*.activityType')
    .notEmpty()
    .withMessage('Activity type is required')
    .isIn([
      // System
      'login', 'logout', 'screen_view', 'button_click', 'form_submit',
      'sync_start', 'sync_complete', 'error', 'performance', 'location_update', 'facility_visit',
      // Medical
      'diagnosis_start', 'diagnosis_complete', 'diagnosis_update', 'diagnosis_review',
      'clinical_decision_support', 'clinical_record_access', 'clinical_guideline_view',
      'patient_assessment', 'patient_data_entry', 'patient_data_update',
      // Neonatal
      'neonatal_care_start', 'neonatal_assessment', 'neonatal_intervention',
      'newborn_screening', 'immediate_newborn_care', 'neonatal_emergency',
      // Clinical Support
      'medication_lookup', 'dosage_calculation', 'treatment_recommendation',
      'referral_initiated', 'follow_up_scheduled', 'health_education_provided',
      // Form
      'form_interaction', 'symptom_selection', 'vital_signs_entry',
      'clinical_findings_entry', 'treatment_plan_creation'
    ])
    .withMessage('Invalid activity type'),
  
  body('activities.*.sessionId')
    .notEmpty()
    .withMessage('Session ID is required'),
  
  handleValidationErrors
];

/**
 * Validation rules for diagnosis creation
 */
const validateDiagnosis = [
  body('complaint.primary')
    .notEmpty()
    .withMessage('Primary complaint is required')
    .isLength({ max: 500 })
    .withMessage('Primary complaint cannot exceed 500 characters'),
  
  body('patient.name')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Patient name cannot exceed 100 characters'),
  
  body('patient.age')
    .optional()
    .isInt({ min: 0, max: 150 })
    .withMessage('Age must be between 0 and 150'),
  
  body('patient.gender')
    .optional()
    .isIn(['male', 'female', 'other', 'not_specified'])
    .withMessage('Invalid gender'),
  
  body('sessionId')
    .notEmpty()
    .withMessage('Session ID is required'),
  
  handleValidationErrors
];

/**
 * Validation rules for sync operations
 */
const validateSync = [
  body('syncType')
    .notEmpty()
    .withMessage('Sync type is required')
    .isIn(['upload', 'download', 'bidirectional', 'conflict_resolution'])
    .withMessage('Invalid sync type'),
  
  body('operation')
    .notEmpty()
    .withMessage('Operation is required')
    .isIn(['full_sync', 'incremental_sync', 'delta_sync', 'manual_sync', 'auto_sync'])
    .withMessage('Invalid operation'),
  
  body('dataTypes')
    .isArray({ min: 1 })
    .withMessage('Data types must be a non-empty array'),
  
  body('dataTypes.*')
    .isIn(['activities', 'diagnoses', 'user_profile', 'preferences', 'clinical_records', 'media_files'])
    .withMessage('Invalid data type'),
  
  handleValidationErrors
];

/**
 * Validation rules for user profile updates
 */
const validateProfileUpdate = [
  body('firstName')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name must be between 1 and 50 characters'),
  
  body('lastName')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name must be between 1 and 50 characters'),
  
  body('facility')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Facility name cannot exceed 100 characters'),
  
  body('state')
    .optional()
    .isLength({ max: 50 })
    .withMessage('State name cannot exceed 50 characters'),
  
  body('contactInfo')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Contact info cannot exceed 100 characters'),
  
  handleValidationErrors
];

/**
 * Validation rules for pagination
 */
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  query('sortBy')
    .optional()
    .isString()
    .withMessage('Sort by must be a string'),
  
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc'),
  
  handleValidationErrors
];

/**
 * Validation rules for date range queries
 */
const validateDateRange = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date'),
  
  handleValidationErrors
];

/**
 * Validation rules for ObjectId parameters
 */
const validateObjectId = (paramName) => [
  param(paramName)
    .isMongoId()
    .withMessage(`${paramName} must be a valid ObjectId`),
  
  handleValidationErrors
];

/**
 * Validation rules for activation key management (admin)
 */
const validateActivationKeyCreation = [
  body('assignedTo.email')
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Invalid email format'),
  
  body('assignedTo.fullName')
    .notEmpty()
    .withMessage('Full name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters'),
  
  body('assignedTo.role')
    .notEmpty()
    .withMessage('Role is required')
    .isIn(['doctor', 'nurse', 'admin', 'technician', 'inspector', 'supervisor'])
    .withMessage('Invalid role'),
  
  body('validUntil')
    .notEmpty()
    .withMessage('Expiration date is required')
    .isISO8601()
    .withMessage('Invalid expiration date format'),
  
  body('maxUses')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Max uses must be a positive integer'),
  
  handleValidationErrors
];

module.exports = {
  handleValidationErrors,
  validateActivation,
  validateLogin,
  validateActivity,
  validateBatchActivity,
  validateDiagnosis,
  validateSync,
  validateProfileUpdate,
  validatePagination,
  validateDateRange,
  validateObjectId,
  validateActivationKeyCreation
};
