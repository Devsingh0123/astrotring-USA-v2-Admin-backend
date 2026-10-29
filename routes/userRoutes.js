import express from 'express';
import {
  getUsers,
  getUserById,
  updateUserStatus,
  adjustUserCredits,
  exportUsers
} from '../controllers/userController.js';
import { adminAuth } from '../middleware/auth.js';

const router = express.Router();

// Apply adminAuth to all user management routes
router.use(adminAuth);

// GET /api/v1/admin/users
router.get('/', getUsers);

// GET /api/v1/admin/users/export (Must be before /:id)
router.get('/export', exportUsers);

// GET /api/v1/admin/users/:id
router.get('/:id', getUserById);

// PATCH /api/v1/admin/users/:id/status
router.patch('/:id/status', updateUserStatus);

// PATCH /api/v1/admin/users/:id/credits
router.patch('/:id/credits', adjustUserCredits);

export default router;
