import express from 'express';
import {
  login,
  getMe,
  refreshToken,
  updateProfile,
  changePassword,
  getSystemStatus
} from '../controllers/authController.js';
import { adminAuth } from '../middleware/auth.js';

const router = express.Router();

// Public auth routes
router.post('/login', login);
router.post('/refresh-token', refreshToken);

// Protected routes (require valid admin session)
router.use(adminAuth);

router.get('/me', getMe);
router.patch('/profile', updateProfile);
router.post('/change-password', changePassword);
router.get('/system-status', getSystemStatus);

export default router;
