import express from 'express';
import {
  getReportPacks,
  createReportPack,
  updateReportPack,
  deleteReportPack
} from '../controllers/reportPackController.js';
import { adminAuth } from '../middleware/auth.js';

const router = express.Router();

// Enforce admin privileges on all report pack routes
router.use(adminAuth);

// GET /api/v1/admin/report-packs - List all report packs
router.get('/', getReportPacks);

// POST /api/v1/admin/report-packs - Create a new report pack
router.post('/', createReportPack);

// PATCH /api/v1/admin/report-packs/:id - Update an existing report pack
router.patch('/:id', updateReportPack);

// DELETE /api/v1/admin/report-packs/:id - Soft delete a report pack
router.delete('/:id', deleteReportPack);

export default router;
