import { verifyJWT } from '../services/tokenService.js';
import User from '../models/User.js';

export const requireAuth = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. No token provided.'
      });
    }

    let decoded;
    try {
      decoded = verifyJWT(token);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired session token. Please log in again.'
      });
    }

    // Find the user by ID
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'The account associated with this token no longer exists.'
      });
    }

    // Soft-deleted or blocked users check
    if (user.isDeleted || user.isBlocked || user.status === 'BLOCKED' || user.status === 'DELETED') {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated, blocked, or removed. Please contact the Super Admin.'
      });
    }

    // Inactive status check
    if (user.status === 'INACTIVE') {
      return res.status(403).json({
        success: false,
        message: 'Your account is currently inactive. Please contact the Super Admin.'
      });
    }

    // Invited status check
    if (user.status === 'INVITED' || !user.isEmailVerified) {
      return res.status(403).json({
        success: false,
        message: 'Account activation pending. Please complete the email verification and set your password.'
      });
    }

    // Verify tokenVersion / Session Revocation Check (logout, password change, etc.)
    const currentVersion = user.tokenVersion !== undefined ? user.tokenVersion : 0;
    const tokenVersion = decoded.tokenVersion !== undefined ? decoded.tokenVersion : 0;

    if (tokenVersion !== currentVersion) {
      return res.status(401).json({
        success: false,
        message: 'Session has been revoked or expired due to a security update or logout. Please log in again.'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('[Auth Middleware Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal authorization error'
    });
  }
};
