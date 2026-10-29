import express from 'express';
import {
  listAdmins,
  createAdminUser,
  updateAdminRole,
  updateAdminStatus,
  deleteAdminUser
} from '../controllers/adminManageController.js';
import { adminAuth, superAdminOnly } from '../middleware/auth.js';

const router = express.Router();

// All staff routes require admin authentication
router.use(adminAuth);

// GET /api/v1/admin/admins - List staff
router.get('/', listAdmins);

// Staff management operations restricted to Super Admins
router.post('/', superAdminOnly, createAdminUser);
router.patch('/:id/role', superAdminOnly, updateAdminRole);
router.patch('/:id/status', superAdminOnly, updateAdminStatus);
router.delete('/:id', superAdminOnly, deleteAdminUser);

export default router;
