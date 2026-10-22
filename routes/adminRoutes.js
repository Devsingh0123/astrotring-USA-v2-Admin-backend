import express from 'express';
import { verifyToken, adminOnly } from '../middleware/auth.js';
import { getAdminStatus } from '../controllers/adminController.js';

const router = express.Router();

/**
 * GET /api/v1/admin/status
 * Protected test route verifying JWT and admin role.
 */
router.get('/status', verifyToken, adminOnly, getAdminStatus);

export default router;
