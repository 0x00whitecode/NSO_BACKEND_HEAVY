const mongoose = require('mongoose');
const ActivationKey = require('../models/ActivationKey');
require('dotenv').config();

async function createAdminActivationKey() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URL, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });
    console.log('✅ Connected to MongoDB successfully');

    // Check if admin key already exists
    const adminKeyValue = 'ADM1-N234-5678-9ABC';
    const existingKey = await ActivationKey.findByKey(adminKeyValue);
    if (existingKey) {
      console.log('✅ Admin activation key already exists:', existingKey.key);
      console.log('Status:', existingKey.status);
      console.log('Valid until:', existingKey.validUntil);
      return;
    }

    // Create admin activation key
    const adminKey = new ActivationKey({
      key: adminKeyValue,
      assignedTo: {
        email: 'admin@nso.gov.ng',
        fullName: 'NSO Administrator',
        role: 'admin',
        facility: 'NSO Headquarters',
        state: 'FCT'
      },
      status: 'active',
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
      maxUses: 10, // Allow multiple uses for admin
      createdBy: new mongoose.Types.ObjectId(), // Mock admin user ID
      notes: 'Admin activation key for NSO admin panel access'
    });

    await adminKey.save();
    
    // Add creation to usage history
    await adminKey.addUsageHistory(
      'created',
      adminKey.createdBy,
      null,
      '127.0.0.1',
      null,
      { notes: 'Admin key created by setup script' }
    );

    console.log('✅ Admin activation key created successfully!');
    console.log('Key:', adminKey.key);
    console.log('Email:', adminKey.assignedTo.email);
    console.log('Valid until:', adminKey.validUntil);
    console.log('Status:', adminKey.status);

  } catch (error) {
    console.error('❌ Error creating admin activation key:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run the script
createAdminActivationKey();
