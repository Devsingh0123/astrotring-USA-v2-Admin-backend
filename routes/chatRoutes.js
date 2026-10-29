import express from 'express';
import {
  getChatThreads,
  getChatStats,
  getChatThreadById
} from '../controllers/chatController.js';
import { adminAuth } from '../middleware/auth.js';

const router = express.Router();

// Apply adminAuth to all chat monitoring routes
router.use(adminAuth);

// GET /api/v1/admin/chats - Paginated thread logs with filters
router.get('/', getChatThreads);

// GET /api/v1/admin/chats/stats - High-level AI usage metrics
router.get('/stats', getChatStats);

// GET /api/v1/admin/chats/:id - Turn-by-turn conversation viewer
router.get('/:id', getChatThreadById);

export default router;
