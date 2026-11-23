import User from '../models/User.js';
import { generateJWT, hashToken } from '../services/tokenService.js';
import emailService from '../services/emailService.js';
import { logActivity } from '../services/auditService.js';
import validator from 'validator';

// 1. User Login
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email and password.'
      });
    }

    if (!validator.isEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email format.'
      });
    }

    // Find user including password
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

    if (!user) {
      await logActivity({
        action: 'LOGIN_FAILED',
        targetUserEmail: email,
        details: { reason: 'User not found' },
        req
      });
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    // Soft-deleted check
    if (user.isDeleted || user.status === 'DELETED') {
      await logActivity({
        action: 'LOGIN_FAILED',
        targetUser: user._id,
        targetUserEmail: email,
        details: { reason: 'Account soft-deleted' },
        req
      });
      return res.status(403).json({
        success: false,
        message: 'This account has been deleted or disabled. Please contact the Super Admin.'
      });
    }

    // Status: INVITED check
    if (user.status === 'INVITED' || !user.isEmailVerified) {
      return res.status(403).json({
        success: false,
        message: 'Account activation pending. Please check your invitation email to complete account setup.'
      });
    }

    // Status: INACTIVE check
    if (user.status === 'INACTIVE') {
      await logActivity({
        action: 'LOGIN_FAILED',
        targetUser: user._id,
        targetUserEmail: email,
        details: { reason: 'Account inactive' },
        req
      });
      return res.status(403).json({
        success: false,
        message: 'Your account is currently deactivated. Please contact your Super Admin.'
      });
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await logActivity({
        action: 'LOGIN_FAILED',
        targetUser: user._id,
        targetUserEmail: email,
        details: { reason: 'Invalid password' },
        req
      });
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    // Update lastLoginAt
    user.lastLoginAt = new Date();
    await user.save({ validateBeforeSave: false });

    // Generate JWT token
    const token = generateJWT(user);

    await logActivity({
      action: 'USER_LOGIN',
      performedBy: user._id,
      targetUser: user._id,
      targetUserEmail: user.email,
      details: { role: user.role },
      req
    });

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      user: user.toJSON()
    });
  } catch (error) {
    next(error);
  }
};

// 2. Accept Invitation and Set Password
export const acceptInvitation = async (req, res, next) => {
  try {
    const { token, email, password, confirmPassword, name } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Invitation activation token is required.'
      });
    }

    if (!email || !String(email).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Invited email address is required to activate this account.'
      });
    }

    if (!password || password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long.'
      });
    }

    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match.'
      });
    }

    const hashedToken = hashToken(token);

    // Find user with matching token and valid expiration
    const user = await User.findOne({
      invitationToken: hashedToken,
      invitationExpiresAt: { $gt: Date.now() }
    }).select('+invitationToken +invitationExpiresAt');

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invitation link is invalid, expired, or has already been used.'
      });
    }

    if (user.isBlocked || user.isDeleted || user.status === 'BLOCKED' || user.status === 'DELETED') {
      return res.status(403).json({
        success: false,
        message: 'This account invitation has been blocked or revoked by Talkism administration.'
      });
    }

    if (user.status === 'ACTIVE' && user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: 'This invitation has already been accepted and the account is active.'
      });
    }

    // Strict Security Binding: Match accepting email against invited user's email
    const normalizedInputEmail = String(email).trim().toLowerCase();
    const normalizedUserEmail = String(user.email).trim().toLowerCase();

    if (normalizedInputEmail !== normalizedUserEmail) {
      await logActivity({
        action: 'SECURITY_ALERT_EMAIL_MISMATCH',
        performedBy: user._id,
        targetUser: user._id,
        targetUserEmail: user.email,
        details: {
          providedEmail: normalizedInputEmail,
          expectedEmail: normalizedUserEmail,
          reason: 'Accepting email did not match invited recipient'
        },
        req
      });

      return res.status(403).json({
        success: false,
        message: 'Security validation failed: The email address provided does not match the invited recipient for this invitation token.'
      });
    }

    // Set user attributes
    if (name && name.trim()) {
      user.name = name.trim();
    }
    user.password = password;
    user.status = 'ACTIVE';
    user.isEmailVerified = true;
    user.invitationToken = undefined;
    user.invitationExpiresAt = undefined;
    user.lastLoginAt = new Date();

    await user.save();

    // Atomic invalidation in MongoDB to guarantee zero token reuse
    await User.updateOne(
      { _id: user._id },
      { $unset: { invitationToken: 1, invitationExpiresAt: 1 } }
    );

    await logActivity({
      action: 'INVITATION_ACCEPTED',
      performedBy: user._id,
      targetUser: user._id,
      targetUserEmail: user.email,
      details: { role: user.role },
      req
    });

    await logActivity({
      action: 'EMAIL_VERIFIED',
      performedBy: user._id,
      targetUser: user._id,
      targetUserEmail: user.email,
      req
    });

    const jwtToken = generateJWT(user);

    return res.status(200).json({
      success: true,
      message: 'Account successfully activated! You can now access your ERP workspace.',
      token: jwtToken,
      user: user.toJSON()
    });
  } catch (error) {
    next(error);
  }
};

// 3. Verify Email Directly (or check token validity)
export const verifyEmail = async (req, res, next) => {
  try {
    const { token, email } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Verification token is required.'
      });
    }

    const hashedToken = hashToken(token);

    const user = await User.findOne({
      invitationToken: hashedToken,
      invitationExpiresAt: { $gt: Date.now() }
    }).select('+invitationToken +invitationExpiresAt');

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invitation link is invalid, expired, or has already been used.'
      });
    }

    if (user.isBlocked || user.isDeleted || user.status === 'BLOCKED') {
      return res.status(403).json({
        success: false,
        message: 'This account invitation has been blocked or revoked.'
      });
    }

    // If client supplied email, verify it strictly
    if (email && String(email).trim()) {
      const normalizedInputEmail = String(email).trim().toLowerCase();
      const normalizedUserEmail = String(user.email).trim().toLowerCase();

      if (normalizedInputEmail !== normalizedUserEmail) {
        return res.status(403).json({
          success: false,
          message: 'Security validation failed: The email address does not match the invited account recipient.'
        });
      }
    }

    // Mask email if not confirmed by caller (e.g. al***@talkism.com) to prevent token sniffing
    const [localPart, domain] = user.email.split('@');
    const maskedLocal = localPart.length > 2
      ? `${localPart.slice(0, 2)}${'*'.repeat(Math.min(localPart.length - 3, 4))}${localPart.slice(-1)}`
      : `${localPart.slice(0, 1)}***`;
    const maskedEmail = `${maskedLocal}@${domain}`;

    return res.status(200).json({
      success: true,
      message: 'Token is valid.',
      email: email ? user.email : maskedEmail,
      isEmailConfirmed: !!email,
      exactEmail: user.email,
      name: user.name,
      role: user.role
    });
  } catch (error) {
    next(error);
  }
};

// 4. Request Password Reset Link
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email || !validator.isEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.'
      });
    }

    const user = await User.findOne({
      email: email.toLowerCase(),
      isDeleted: false,
      status: 'ACTIVE'
    });

    if (!user) {
      // Do not disclose whether email exists for security
      return res.status(200).json({
        success: true,
        message: 'If an active account exists with that email, a password reset link has been dispatched.'
      });
    }

    const rawToken = user.generateResetPasswordToken();
    await user.save({ validateBeforeSave: false });

    await emailService.sendPasswordResetEmail({ user, rawToken });

    await logActivity({
      action: 'PASSWORD_RESET_REQUESTED',
      performedBy: user._id,
      targetUser: user._id,
      targetUserEmail: user.email,
      req
    });

    return res.status(200).json({
      success: true,
      message: 'If an active account exists with that email, a password reset link has been dispatched.'
    });
  } catch (error) {
    next(error);
  }
};

// 5. Reset Password using token
export const resetPassword = async (req, res, next) => {
  try {
    const { token, password, confirmPassword } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Reset token is required.'
      });
    }

    if (!password || password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long.'
      });
    }

    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match.'
      });
    }

    const hashedToken = hashToken(token);

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpiresAt: { $gt: Date.now() },
      isDeleted: false
    }).select('+resetPasswordToken +resetPasswordExpiresAt');

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Password reset link is invalid or has expired.'
      });
    }

    user.password = password;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpiresAt = undefined;
    await user.save();

    await logActivity({
      action: 'PASSWORD_RESET_COMPLETED',
      performedBy: user._id,
      targetUser: user._id,
      targetUserEmail: user.email,
      req
    });

    return res.status(200).json({
      success: true,
      message: 'Password has been successfully reset. All previous sessions have been revoked. You can now log in.'
    });
  } catch (error) {
    next(error);
  }
};

// 6. Get Current User (Me)
export const getMe = async (req, res) => {
  return res.status(200).json({
    success: true,
    user: req.user.toJSON()
  });
};

// 7. Logout (Server-side Session Revocation)
export const logout = async (req, res) => {
  if (req.user) {
    // Invalidate JWT server-side by incrementing tokenVersion
    await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });

    await logActivity({
      action: 'USER_LOGOUT',
      performedBy: req.user._id,
      targetUser: req.user._id,
      targetUserEmail: req.user.email,
      req
    });
  }

  return res.status(200).json({
    success: true,
    message: 'Logged out successfully. Session revoked on server.'
  });
};
