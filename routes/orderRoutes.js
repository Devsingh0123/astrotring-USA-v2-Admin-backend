import express from 'express';
import { getOrders, getOrderById } from '../controllers/orderController.js';
import { adminAuth } from '../middleware/auth.js';

const router = express.Router();

// Apply adminAuth to all order routes
router.use(adminAuth);

// GET /api/v1/admin/orders
router.get('/', getOrders);

// GET /api/v1/admin/orders/:id
router.get('/:id', getOrderById);

export default router;
