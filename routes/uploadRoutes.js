import express from 'express';
import {
  uploadFile,
  uploadMultipleFiles,
  deleteFile
} from '../controllers/uploadController.js';
import { uploadSingle, uploadMultiple } from '../middleware/upload.js';
import { adminAuth } from '../middleware/auth.js';

const router = express.Router();

// Enforce admin authentication on all upload endpoints
router.use(adminAuth);

// POST /api/v1/admin/uploads - Single file upload ('file')
router.post('/', uploadSingle('file'), uploadFile);

// POST /api/v1/admin/uploads/bulk - Bulk files upload ('files', max 5)
router.post('/bulk', uploadMultiple('files', 5), uploadMultipleFiles);

// DELETE /api/v1/admin/uploads - Delete file by public_id or url
router.delete('/', deleteFile);

export default router;
