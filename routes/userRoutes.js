import express from 'express';
import {
  getUsers,
  getUserById,
  updateUserStatus
} from '../controllers/userController.js';
import { adminAuth } from '../middleware/auth.js';

const router = express.Router();

// Apply adminAuth to all user management routes
router.use(adminAuth);

// GET /api/v1/admin/users
router.get('/', getUsers);

// GET /api/v1/admin/users/:id
router.get('/:id', getUserById);

// PATCH /api/v1/admin/users/:id/status
router.patch('/:id/status', updateUserStatus);

export default router;
