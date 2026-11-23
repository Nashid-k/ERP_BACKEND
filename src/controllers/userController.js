import User from '../models/User.js';
import { logActivity } from '../services/auditService.js';
import { generateJWT } from '../services/tokenService.js';

// 1. Get Logged-in User Profile
export const getMyProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('createdBy', 'name email');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User profile not found.'
      });
    }

    return res.status(200).json({
      success: true,
      user: user.toJSON()
    });
  } catch (error) {
    next(error);
  }
};

// 2. Update Permitted Profile Fields Only
export const updateMyProfile = async (req, res, next) => {
  try {
    const { name, phone, department, bio, ...forbiddenFields } = req.body;

    // Security check: Check if user attempted to tamper with unauthorized fields
    const sensitiveAttempt = ['role', 'email', 'status', 'isDeleted', 'isEmailVerified', 'createdBy', 'deletedBy']
      .filter((field) => forbiddenFields[field] !== undefined);

    if (sensitiveAttempt.length > 0) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: You are not authorized to modify restricted system fields (${sensitiveAttempt.join(', ')}). Only your profile details (name, phone, department, bio) can be modified.`
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    if (name && name.trim()) user.name = name.trim();
    if (phone !== undefined) user.phone = phone.trim();
    if (department !== undefined) user.department = department.trim();
    if (bio !== undefined) user.bio = bio.trim();

    await user.save();

    await logActivity({
      action: 'PROFILE_UPDATED',
      performedBy: user._id,
      targetUser: user._id,
      targetUserEmail: user.email,
      details: { updatedFields: { name, phone, department, bio } },
      req
    });

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      user: user.toJSON()
    });
  } catch (error) {
    next(error);
  }
};

// 3. Change Own Password
export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword, confirmNewPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both current and new password.'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long.'
      });
    }

    if (confirmNewPassword && newPassword !== confirmNewPassword) {
      return res.status(400).json({
        success: false,
        message: 'New passwords do not match.'
      });
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Incorrect current password.'
      });
    }

    user.password = newPassword;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    await logActivity({
      action: 'PASSWORD_CHANGED',
      performedBy: user._id,
      targetUser: user._id,
      targetUserEmail: user.email,
      req
    });

    const freshToken = generateJWT(user);

    return res.status(200).json({
      success: true,
      message: 'Password changed successfully. All other active sessions have been revoked.',
      token: freshToken
    });
  } catch (error) {
    next(error);
  }
};
