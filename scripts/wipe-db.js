#!/usr/bin/env node
/*
  Wipes the MongoDB database or selected collections.
  SAFEGUARDS:
  - Requires WIPE_CONFIRM=YES
  - Blocks in production unless FORCE_PROD=YES
  - Optional DRY_RUN=true to preview actions

  Usage examples:
  # Drop entire DB (recommended for full wipe)
  WIPE_CONFIRM=YES node backend/scripts/wipe-db.js

  # Drop only certain collections
  WIPE_CONFIRM=YES COLLECTIONS=users,activationkeys,activities node backend/scripts/wipe-db.js

  # Dry run (no changes)
  DRY_RUN=true WIPE_CONFIRM=YES node backend/scripts/wipe-db.js

  # Force in production (NOT RECOMMENDED)
  WIPE_CONFIRM=YES FORCE_PROD=YES node backend/scripts/wipe-db.js
*/

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const config = require('../config');

(async () => {
  const { WIPE_CONFIRM, COLLECTIONS, DRY_RUN, FORCE_PROD } = process.env;

  if (WIPE_CONFIRM !== 'YES') {
    console.error('Refusing to proceed: set WIPE_CONFIRM=YES to confirm.');
    process.exit(1);
  }

  const isProd = (config.NODE_ENV || '').toLowerCase() === 'production';
  if (isProd && FORCE_PROD !== 'YES') {
    console.error('Refusing to run in production without FORCE_PROD=YES');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URL || config.MONGODB_URL || 'mongodb://localhost:27017/nso_db';

  console.log('Connecting to MongoDB...');
  console.log('URI:', uri.replace(/:[^:@]*@/, ':****@'));

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });
    console.log('Connected.');

    const db = mongoose.connection.db;

    if (DRY_RUN === 'true') {
      const colls = await db.listCollections().toArray();
      console.log('DRY RUN. Existing collections:');
      colls.forEach(c => console.log(' -', c.name));
      if (COLLECTIONS) {
        console.log('Would drop collections:', COLLECTIONS.split(',').map(s => s.trim()).join(', '));
      } else {
        console.log('Would drop entire database');
      }
      await mongoose.disconnect();
      process.exit(0);
    }

    if (COLLECTIONS) {
      const targets = COLLECTIONS.split(',').map(s => s.trim()).filter(Boolean);
      if (targets.length === 0) {
        console.log('No valid collections specified. Nothing to do.');
        await mongoose.disconnect();
        process.exit(0);
      }

      const existing = (await db.listCollections().toArray()).map(c => c.name.toLowerCase());
      for (const name of targets) {
        const lower = name.toLowerCase();
        if (existing.includes(lower)) {
          console.log('Dropping collection:', lower);
          await db.collection(lower).drop();
        } else {
          console.log('Collection not found (skipping):', lower);
        }
      }
      console.log('Selected collections dropped.');
    } else {
      console.log('Dropping entire database...');
      await db.dropDatabase();
      console.log('Database dropped.');
    }

    await mongoose.disconnect();
    console.log('Done.');
    process.exit(0);
  } catch (err) {
    console.error('Error wiping database:', err);
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  }
})();

