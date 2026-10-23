import express from 'express';
import { login, getMe } from '../controllers/authController.js';
import { adminAuth } from '../middleware/auth.js';

const router = express.Router();

// Public login route
router.post('/login', login);

// Protected current admin profile
router.get('/me', adminAuth, getMe);

export default router;
