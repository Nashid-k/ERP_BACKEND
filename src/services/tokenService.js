import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export const generateJWT = (user) => {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion !== undefined ? user.tokenVersion : 0
    },
    process.env.JWT_SECRET || 'fallback_secret_erp_2026',
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    }
  );
};

export const verifyJWT = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_erp_2026');
};

export const hashToken = (rawToken) => {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
};
