import express from 'express';
import {
  getMyProfile,
  updateMyProfile,
  changePassword
} from '../controllers/userController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Apply auth to all regular user routes
router.use(requireAuth);

router.get('/me', getMyProfile);
router.patch('/me', updateMyProfile);
router.post('/change-password', changePassword);

export default router;
