import express from 'express';
import {
  getCoupons,
  createCoupon,
  updateCouponStatus
} from '../controllers/couponController.js';
import { adminAuth } from '../middleware/auth.js';

const router = express.Router();

// Apply adminAuth to all coupon routes
router.use(adminAuth);

// GET /api/v1/admin/coupons
router.get('/', getCoupons);

// POST /api/v1/admin/coupons
router.post('/', createCoupon);

// PATCH /api/v1/admin/coupons/:id/status
router.patch('/:id/status', updateCouponStatus);

export default router;
