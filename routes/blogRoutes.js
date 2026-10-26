import express from 'express';
import {
  getBlogs,
  getBlogById,
  createBlog,
  updateBlog,
  updateBlogStatus,
  deleteBlog
} from '../controllers/blogController.js';
import { adminAuth } from '../middleware/auth.js';

const router = express.Router();

// Apply adminAuth to all blog routes
router.use(adminAuth);

// GET /api/v1/admin/blogs
router.get('/', getBlogs);

// GET /api/v1/admin/blogs/:id
router.get('/:id', getBlogById);

// POST /api/v1/admin/blogs
router.post('/', createBlog);

// PUT /api/v1/admin/blogs/:id
router.put('/:id', updateBlog);

// PATCH /api/v1/admin/blogs/:id
router.patch('/:id', updateBlog);

// PATCH /api/v1/admin/blogs/:id/status
router.patch('/:id/status', updateBlogStatus);

// DELETE /api/v1/admin/blogs/:id
router.delete('/:id', deleteBlog);

export default router;
