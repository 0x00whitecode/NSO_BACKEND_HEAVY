#!/usr/bin/env node

/**
 * Script to generate activation keys with encrypted user data for offline activation
 * These keys contain all necessary user information encrypted within them
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Configuration
const ENCRYPTION_KEY = 'nso-offline-key-2024'; // Must match mobile app
const OUTPUT_FILE = path.join(__dirname, '../generated-keys.json');

// Sample user data for testing
const sampleUsers = [
  {
    userId: 'user_001',
    fullName: 'Dr. Sarah Johnson',
    role: 'doctor',
    facility: 'General Hospital Lagos',
    state: 'Lagos',
    contactInfo: 'sarah.johnson@hospital.ng',
    validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    maxUses: 1,
    usageCount: 0,
    status: 'active',
    createdAt: new Date(),
    assignedBy: 'admin@nso.gov.ng'
  },
  {
    userId: 'user_002',
    fullName: 'Nurse Mary Wilson',
    role: 'nurse',
    facility: 'Primary Health Center',
    state: 'Abuja',
    contactInfo: 'mary.wilson@clinic.ng',
    validUntil: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), // 6 months
    maxUses: 1,
    usageCount: 0,
    status: 'active',
    createdAt: new Date(),
    assignedBy: 'admin@nso.gov.ng'
  },
  {
    userId: 'user_003',
    fullName: 'Technician John Smith',
    role: 'technician',
    facility: 'Medical Laboratory',
    state: 'Kano',
    contactInfo: 'john.smith@lab.ng',
    validUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 3 months
    maxUses: 1,
    usageCount: 0,
    status: 'active',
    createdAt: new Date(),
    assignedBy: 'admin@nso.gov.ng'
  },
  {
    userId: 'user_004',
    fullName: 'Inspector David Brown',
    role: 'inspector',
    facility: 'Health Inspectorate',
    state: 'Rivers',
    contactInfo: 'david.brown@inspectorate.ng',
    validUntil: new Date(Date.now() + 730 * 24 * 60 * 60 * 1000), // 2 years
    maxUses: 1,
    usageCount: 0,
    status: 'active',
    createdAt: new Date(),
    assignedBy: 'admin@nso.gov.ng'
  }
];

/**
 * Encrypt data using AES
 */
function encryptData(data) {
  try {
    const jsonString = JSON.stringify(data);
    
    // Use a simpler key derivation method
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    
    let encryptedData = cipher.update(jsonString, 'utf8', 'hex');
    encryptedData += cipher.final('hex');
    
    // Return IV + encrypted data
    return iv.toString('hex') + encryptedData;
  } catch (error) {
    console.error('Encryption error:', error);
    return null;
  }
}

/**
 * Generate a random key prefix
 */
function generateKeyPrefix() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let prefix = '';
  for (let i = 0; i < 16; i++) {
    prefix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return prefix;
}

/**
 * Generate activation key with encrypted user data
 */
function generateActivationKey(userData) {
  try {
    // Encrypt the user data
    const encryptedData = encryptData(userData);
    if (!encryptedData) {
      throw new Error('Failed to encrypt user data');
    }

    // Generate a random key prefix (16 characters)
    const keyPrefix = generateKeyPrefix();
    
    // Combine prefix and encrypted data
    const fullKey = keyPrefix + encryptedData;
    
    // Format the key with dashes for readability
    const formattedKey = fullKey.replace(/(.{4})/g, '$1-').replace(/-$/, '');
    
    return {
      key: formattedKey,
      rawKey: fullKey,
      encryptedData: encryptedData,
      userData: userData
    };
  } catch (error) {
    console.error('Error generating activation key:', error);
    return null;
  }
}

/**
 * Main function to generate all keys
 */
async function generateAllKeys() {
  console.log('🔐 Generating offline activation keys...\n');
  
  const generatedKeys = [];
  
  for (const user of sampleUsers) {
    console.log(`📝 Generating key for: ${user.fullName} (${user.role})`);
    
    const activationKey = generateActivationKey(user);
    if (activationKey) {
      generatedKeys.push({
        ...activationKey,
        user: {
          fullName: user.fullName,
          role: user.role,
          facility: user.facility,
          state: user.state
        }
      });
      
      console.log(`✅ Generated: ${activationKey.key}`);
      console.log(`   Expires: ${user.validUntil.toLocaleDateString()}`);
      console.log(`   Status: ${user.status}\n`);
    } else {
      console.log(`❌ Failed to generate key for ${user.fullName}\n`);
    }
  }
  
  // Save to file
  const output = {
    generatedAt: new Date().toISOString(),
    encryptionKey: ENCRYPTION_KEY,
    totalKeys: generatedKeys.length,
    keys: generatedKeys
  };
  
  try {
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`💾 Generated keys saved to: ${OUTPUT_FILE}`);
  } catch (error) {
    console.error('❌ Error saving to file:', error);
  }
  
  // Display summary
  console.log('\n📊 Summary:');
  console.log(`Total keys generated: ${generatedKeys.length}`);
  console.log(`Encryption key: ${ENCRYPTION_KEY}`);
  console.log(`Output file: ${OUTPUT_FILE}`);
  
  // Display keys for easy copying
  console.log('\n🔑 Generated Keys (copy these for testing):');
  generatedKeys.forEach((keyData, index) => {
    console.log(`\n${index + 1}. ${keyData.user.fullName} (${keyData.user.role})`);
    console.log(`   Key: ${keyData.key}`);
    console.log(`   Facility: ${keyData.user.facility}`);
    console.log(`   State: ${keyData.user.state}`);
  });
  
  console.log('\n🎉 Key generation complete!');
  console.log('\n📱 Instructions for mobile app testing:');
  console.log('1. Use any of the generated keys above in the mobile app');
  console.log('2. The app will decrypt the key offline without server communication');
  console.log('3. User data will be extracted and stored locally');
  console.log('4. No internet connection required for activation');
}

// Run the script
if (require.main === module) {
  generateAllKeys().catch(console.error);
}

module.exports = {
  generateActivationKey,
  encryptData,
  generateAllKeys
};
