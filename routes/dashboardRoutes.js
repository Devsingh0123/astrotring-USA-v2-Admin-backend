import express from 'express';
import { getDashboardStats } from '../controllers/dashboardController.js';
import { adminAuth } from '../middleware/auth.js';

const router = express.Router();

// Apply adminAuth to all dashboard routes
router.use(adminAuth);

// GET /api/v1/admin/dashboard
router.get('/', getDashboardStats);

export default router;
