#!/usr/bin/env node

/**
 * Debug script to test activation key generation and validation
 */

const mongoose = require('mongoose');
const ActivationKey = require('./models/ActivationKey');
const activationKeyService = require('./services/activationKeyService');
const config = require('./config');

async function debugActivationFlow() {
  try {
    console.log('🔍 Starting activation key debug process...\n');
    
    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(config.MONGODB_URL, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });
    console.log('✅ Connected to MongoDB\n');

    // Step 1: Generate a new activation key using the service
    console.log('🔑 Step 1: Generating new activation key...');
    const userDetails = {
      fullName: 'Test User Debug',
      email: 'debug@test.com',
      role: 'doctor',
      facility: 'Debug Hospital',
      state: 'Test State',
      phone: '+2348012345678'
    };

    const keyResult = await activationKeyService.generateKey(userDetails, {
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      notes: 'Debug test key',
      createdBy: new mongoose.Types.ObjectId()
    });

    if (!keyResult.success) {
      console.error('❌ Failed to generate key:', keyResult.error);
      return;
    }

    const generatedKey = keyResult.data.key;
    console.log(`✅ Generated key: ${generatedKey}`);
    console.log(`   Status: ${keyResult.data.status}`);
    console.log(`   Expires: ${keyResult.data.expiresAt}`);
    console.log(`   Remaining days: ${keyResult.data.remainingDays}\n`);

    // Step 2: Validate the key using the service
    console.log('🔍 Step 2: Validating the generated key...');
    const validationResult = await activationKeyService.validateKey(generatedKey);
    
    if (!validationResult.success) {
      console.error('❌ Key validation failed:', validationResult.error);
      console.error('   Code:', validationResult.code);
      console.error('   Reason:', validationResult.reason);
    } else {
      console.log('✅ Key validation successful');
      console.log('   User data decrypted:', JSON.stringify(validationResult.data.userData, null, 2));
      console.log('   Key details:', JSON.stringify(validationResult.data.keyDetails, null, 2));
    }
    console.log('');

    // Step 3: Test direct database lookup
    console.log('🔍 Step 3: Testing direct database lookup...');
    const dbKey = await ActivationKey.findByKey(generatedKey);
    
    if (!dbKey) {
      console.error('❌ Key not found in database');
    } else {
      console.log('✅ Key found in database');
      console.log(`   ID: ${dbKey._id}`);
      console.log(`   Status: ${dbKey.status}`);
      console.log(`   isValid: ${dbKey.isValid}`);
      console.log(`   isExpired: ${dbKey.isExpired}`);
      console.log(`   canUse: ${dbKey.canUse()}`);
      console.log(`   User details: ${JSON.stringify(dbKey.userDetails, null, 2)}`);
    }
    console.log('');

    // Step 4: Test the mobile app activation flow simulation
    console.log('🔍 Step 4: Simulating mobile app activation...');
    
    // Normalize key like mobile app does
    const normalizedKey = generatedKey.replace(/\D/g, '');
    console.log(`   Original key: ${generatedKey}`);
    console.log(`   Normalized key: ${normalizedKey}`);
    
    // Test key format validation
    if (normalizedKey.length !== 12 || !/^\d{12}$/.test(normalizedKey)) {
      console.error('❌ Key format validation failed');
      console.error(`   Length: ${normalizedKey.length} (expected 12)`);
      console.error(`   Format: ${/^\d{12}$/.test(normalizedKey) ? 'valid' : 'invalid'}`);
    } else {
      console.log('✅ Key format validation passed');
    }

    // Test backend activation endpoint simulation
    console.log('\n🔍 Step 5: Testing backend activation logic...');
    const keyDoc = await ActivationKey.findByKey(normalizedKey);
    
    if (!keyDoc) {
      console.error('❌ Key not found for activation');
    } else {
      console.log('✅ Key found for activation');
      console.log(`   Status: ${keyDoc.status}`);
      console.log(`   isValid: ${keyDoc.isValid}`);
      
      if (!keyDoc.isValid) {
        let reason = 'Unknown';
        if (keyDoc.status === 'used') reason = 'Already used';
        else if (keyDoc.status === 'expired') reason = 'Expired';
        else if (keyDoc.status === 'revoked') reason = 'Revoked';
        else if (keyDoc.isExpired) reason = 'Expired';
        
        console.error(`❌ Key is not valid: ${reason}`);
      } else {
        console.log('✅ Key is valid for activation');
        
        // Test decryption
        const userData = ActivationKey.decryptUserData(keyDoc.encryptedUserData, normalizedKey);
        if (!userData) {
          console.error('❌ Failed to decrypt user data');
        } else {
          console.log('✅ User data decrypted successfully');
          console.log('   Decrypted data:', JSON.stringify(userData, null, 2));
        }
      }
    }

    // Step 6: Check for existing keys in database
    console.log('\n🔍 Step 6: Checking existing keys in database...');
    const existingKeys = await ActivationKey.find({}).limit(5);
    console.log(`Found ${existingKeys.length} existing keys:`);
    
    for (const key of existingKeys) {
      console.log(`   Key: ${key.key} | Status: ${key.status} | Valid: ${key.isValid} | Expires: ${key.expiresAt}`);
    }

    // Step 7: Test with a known working key if any exist
    if (existingKeys.length > 0) {
      console.log('\n🔍 Step 7: Testing with existing key...');
      const testKey = existingKeys.find(k => k.status === 'unused' || k.status === 'active');
      
      if (testKey) {
        console.log(`Testing with key: ${testKey.key}`);
        const testValidation = await activationKeyService.validateKey(testKey.key);
        
        if (testValidation.success) {
          console.log('✅ Existing key validation successful');
        } else {
          console.error('❌ Existing key validation failed:', testValidation.error);
        }
      } else {
        console.log('⚠️  No unused/active keys found to test');
      }
    }

    console.log('\n🎉 Debug process completed!');

  } catch (error) {
    console.error('❌ Debug process failed:', error);
    console.error('Stack trace:', error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('📡 Database connection closed');
  }
}

// Run the debug script
debugActivationFlow();