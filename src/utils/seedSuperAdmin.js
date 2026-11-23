import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import User from '../models/User.js';
import { connectDB } from '../config/db.js';
import { logActivity } from '../services/auditService.js';

export const seedSuperAdmin = async () => {
  try {
    const isProduction = process.env.NODE_ENV === 'production';
    const adminEmail = (process.env.SUPER_ADMIN_EMAIL || 'superadmin@talkism.com').toLowerCase().trim();
    const adminPassword = process.env.SUPER_ADMIN_PASSWORD || (isProduction ? null : 'SuperAdmin@2026!');
    const adminName = process.env.SUPER_ADMIN_NAME || 'Talkism Administrator';

    // In production, prohibit default or missing Super Admin password
    if (isProduction && (!adminPassword || adminPassword === 'SuperAdmin@2026!')) {
      throw new Error(
        'SECURITY REJECTION: SUPER_ADMIN_PASSWORD must be explicitly defined with a strong secret in production. Default passwords are prohibited.'
      );
    }

    // Check if any Super Admin exists
    const existingSuperAdmin = await User.findOne({
      role: 'SUPER_ADMIN',
      isDeleted: false
    });

    if (existingSuperAdmin) {
      console.log(`[Seed]: Active Super Admin exists (${existingSuperAdmin.email}). Skipping initial seed.`);
      return existingSuperAdmin;
    }

    // Check if the configured email exists
    let admin = await User.findOne({ email: adminEmail });

    if (admin) {
      admin.role = 'SUPER_ADMIN';
      admin.status = 'ACTIVE';
      admin.isEmailVerified = true;
      admin.isDeleted = false;
      admin.password = adminPassword;
      await admin.save();
      console.log(`[Seed]: Existing user ${adminEmail} updated to Super Admin.`);
    } else {
      admin = new User({
        name: adminName,
        email: adminEmail,
        password: adminPassword,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        isEmailVerified: true,
        isDeleted: false,
        department: 'Executive Management, Ernakulam HQ',
        phone: '+91 484 290 0000',
        bio: 'Head of Systems & Governance, Talkism Private Limited, Ernakulam'
      });
      await admin.save();
      console.log(`[Seed]: Initial Super Admin created successfully (${adminEmail}).`);
    }

    await logActivity({
      action: 'USER_CREATED',
      performedBy: admin._id,
      targetUser: admin._id,
      targetUserEmail: admin.email,
      details: { role: 'SUPER_ADMIN', note: 'Initial system provisioning' }
    });

    console.log(`[Seed]: Super Admin account verified (${adminEmail}). Passwords are not written to application logs.`);
    return admin;
  } catch (error) {
    console.error('[Seed Error]:', error.message);
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }
  }
};

// If run directly via "npm run seed"
if (process.argv[1]?.includes('seedSuperAdmin.js')) {
  (async () => {
    await connectDB();
    await seedSuperAdmin();
    await mongoose.disconnect();
    process.exit(0);
  })();
}
