import express from 'express';
import {
  login,
  acceptInvitation,
  verifyEmail,
  forgotPassword,
  resetPassword,
  getMe,
  logout
} from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter, passwordResetLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

router.post('/login', authLimiter, login);
router.post('/accept-invitation', authLimiter, acceptInvitation);
router.post('/verify-email', verifyEmail);
router.post('/forgot-password', passwordResetLimiter, forgotPassword);
router.post('/reset-password', passwordResetLimiter, resetPassword);

router.get('/me', requireAuth, getMe);
router.post('/logout', requireAuth, logout);

export default router;
