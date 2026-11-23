import express from 'express';
import {
  createUser,
  listUsers,
  getUserStats,
  getUserById,
  updateUser,
  updateUserStatus,
  blockUser,
  unblockUser,
  softDeleteUser,
  restoreUser,
  resendInvitation
} from '../controllers/adminController.js';
import { getAuditLogs } from '../controllers/auditController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireSuperAdmin } from '../middleware/rbac.js';

const router = express.Router();

// Apply auth and Super Admin role check to all admin routes
router.use(requireAuth, requireSuperAdmin);

// Super Admin User Management
router.post('/users', createUser);
router.get('/users', listUsers);
router.get('/users/stats', getUserStats);
router.get('/users/:id', getUserById);
router.patch('/users/:id', updateUser);
router.patch('/users/:id/status', updateUserStatus);
router.patch('/users/:id/block', blockUser);
router.patch('/users/:id/unblock', unblockUser);
router.delete('/users/:id', softDeleteUser);
router.patch('/users/:id/restore', restoreUser);
router.post('/users/:id/resend-invitation', resendInvitation);

// Audit logs
router.get('/audit-logs', getAuditLogs);

export default router;
