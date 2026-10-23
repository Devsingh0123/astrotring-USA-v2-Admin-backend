import express from 'express';
import {
  getQuestionPacks,
  createQuestionPack,
  updateQuestionPack,
  deleteQuestionPack
} from '../controllers/questionPackController.js';
import { adminAuth } from '../middleware/auth.js';

const router = express.Router();

// Apply adminAuth to all question pack endpoints
router.use(adminAuth);

// GET /api/v1/admin/question-packs
router.get('/', getQuestionPacks);

// POST /api/v1/admin/question-packs
router.post('/', createQuestionPack);

// PATCH /api/v1/admin/question-packs/:id
router.patch('/:id', updateQuestionPack);

// DELETE /api/v1/admin/question-packs/:id
router.delete('/:id', deleteQuestionPack);

export default router;
