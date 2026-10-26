import express from 'express';
import { login, getMe, refreshToken } from '../controllers/authController.js';
import { adminAuth } from '../middleware/auth.js';

const router = express.Router();

// Public auth routes
router.post('/login', login);
router.post('/refresh-token', refreshToken);

// Protected current admin profile
router.get('/me', adminAuth, getMe);

export default router;
