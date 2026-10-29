import { Op } from 'sequelize';
import { Blog, Admin } from '../models/index.js';
import { AppError } from '../utils/appError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Helper: Converts any title string into a clean, URL-safe slug.
 */
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // remove non-word chars
    .replace(/[\s_-]+/g, '-')  // replace spaces and underscores with a single hyphen
    .replace(/^-+|-+$/g, '');  // trim leading/trailing hyphens
}

/**
 * Helper: Calculates estimated reading time (in minutes) based on 200 wpm.
 */
function calculateReadTime(content) {
  if (!content) return 1;
  const cleanText = content.replace(/<[^>]*>?/gm, '');
  const wordCount = cleanText.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / 200));
}

/**
 * Helper: Ensures unique slug by appending incremental numeric suffixes if duplicate exists.
 */
async function getUniqueSlug(baseSlug, excludeBlogId = null) {
  let candidate = baseSlug || 'astrology-post';
  let counter = 1;

  while (true) {
    const whereClause = { slug: candidate };
    if (excludeBlogId) {
      whereClause.id = { [Op.ne]: excludeBlogId };
    }

    const existing = await Blog.findOne({ where: whereClause, paranoid: false });
    if (!existing) {
      return candidate;
    }
    candidate = `${baseSlug}-${counter}`;
    counter++;
  }
}

/**
 * GET /api/v1/admin/blogs
 * Retrieves a paginated list of blogs with search and filtering by status/category.
 */
export const getBlogs = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const { search, status, category, sort_by = 'created_at', order = 'DESC' } = req.query;

  const whereClause = {};

  if (status && status !== 'all') {
    whereClause.status = status;
  }

  if (category && category !== 'all') {
    whereClause.category = category;
  }

  if (search && search.trim()) {
    const searchFilter = `%${search.trim()}%`;
    whereClause[Op.or] = [
      { title: { [Op.like]: searchFilter } },
      { slug: { [Op.like]: searchFilter } },
      { excerpt: { [Op.like]: searchFilter } }
    ];
  }

  const allowedSortColumns = ['title', 'category', 'status', 'published_at', 'views_count', 'created_at'];
  const sortColumn = allowedSortColumns.includes(sort_by) ? sort_by : 'created_at';
  const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const { count, rows: blogs } = await Blog.findAndCountAll({
    where: whereClause,
    include: [
      {
        model: Admin,
        as: 'author',
        attributes: ['id', 'email', 'name', 'role', 'avatar_url']
      }
    ],
    order: [[sortColumn, sortOrder]],
    limit,
    offset
  });

  const totalPages = Math.ceil(count / limit) || 1;

  res.status(200).json({
    success: true,
    message: 'Blogs retrieved successfully',
    data: {
      blogs,
      pagination: {
        total: count,
        page,
        limit,
        totalPages
      }
    }
  });
});

/**
 * GET /api/v1/admin/blogs/:id
 * Retrieves full blog details by UUID or unique slug.
 */
export const getBlogById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  const whereClause = isUUID ? { id } : { slug: id };

  const blog = await Blog.findOne({
    where: whereClause,
    include: [
      {
        model: Admin,
        as: 'author',
        attributes: ['id', 'email', 'name', 'role', 'avatar_url']
      }
    ]
  });

  if (!blog) {
    return next(new AppError(`Blog not found with identifier "${id}".`, 404));
  }

  res.status(200).json({
    success: true,
    message: 'Blog details retrieved successfully',
    data: {
      blog
    }
  });
});

/**
 * POST /api/v1/admin/blogs
 * Creates a new blog article in the database.
 */
export const createBlog = asyncHandler(async (req, res, next) => {
  const {
    title,
    slug,
    excerpt,
    content,
    featured_image,
    category,
    tags,
    status = 'draft',
    published_at,
    read_time_minutes,
    meta_title,
    meta_description,
    meta_keywords,
    canonical_url
  } = req.body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    return next(new AppError('A valid blog title is required.', 400));
  }

  if (!content || typeof content !== 'string' || !content.trim()) {
    return next(new AppError('Blog content cannot be empty.', 400));
  }

  const validStatuses = ['draft', 'published', 'archived'];
  if (!validStatuses.includes(status)) {
    return next(new AppError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400));
  }

  // Generate or sanitize slug
  const baseSlug = slug && slug.trim() ? slugify(slug) : slugify(title);
  const finalSlug = await getUniqueSlug(baseSlug);

  // Compute read time if not provided
  const finalReadTime =
    read_time_minutes && Number(read_time_minutes) > 0
      ? parseInt(read_time_minutes, 10)
      : calculateReadTime(content);

  // Determine published timestamp
  let finalPublishedAt = published_at ? new Date(published_at) : null;
  if (status === 'published' && !finalPublishedAt) {
    finalPublishedAt = new Date();
  }

  const blog = await Blog.create({
    author_id: req.user.id,
    title: title.trim(),
    slug: finalSlug,
    excerpt: excerpt ? excerpt.trim() : null,
    content,
    featured_image: featured_image?.trim() || null,
    category: category?.trim() || 'vedic-astrology',
    tags: Array.isArray(tags) ? tags : [],
    status,
    published_at: finalPublishedAt,
    read_time_minutes: finalReadTime,
    views_count: 0,
    meta_title: meta_title?.trim() || null,
    meta_description: meta_description?.trim() || null,
    meta_keywords: meta_keywords?.trim() || null,
    canonical_url: canonical_url?.trim() || null
  });

  const createdBlog = await Blog.findByPk(blog.id, {
    include: [
      {
        model: Admin,
        as: 'author',
        attributes: ['id', 'email', 'name', 'role', 'avatar_url']
      }
    ]
  });

  res.status(201).json({
    success: true,
    message: 'Blog created successfully',
    data: {
      blog: createdBlog
    }
  });
});

/**
 * PUT or PATCH /api/v1/admin/blogs/:id
 * Updates an existing blog article.
 */
export const updateBlog = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const blog = await Blog.findByPk(id);
  if (!blog) {
    return next(new AppError(`Blog with ID "${id}" not found.`, 404));
  }

  const {
    title,
    slug,
    excerpt,
    content,
    featured_image,
    category,
    tags,
    status,
    published_at,
    read_time_minutes,
    meta_title,
    meta_description,
    meta_keywords,
    canonical_url
  } = req.body;

  if (title !== undefined) {
    if (!title || typeof title !== 'string' || !title.trim()) {
      return next(new AppError('Blog title cannot be empty.', 400));
    }
    blog.title = title.trim();
  }

  if (slug !== undefined) {
    const rawSlug = slugify(slug || blog.title);
    blog.slug = await getUniqueSlug(rawSlug, blog.id);
  }

  if (content !== undefined) {
    if (!content || typeof content !== 'string' || !content.trim()) {
      return next(new AppError('Blog content cannot be empty.', 400));
    }
    blog.content = content;
    if (read_time_minutes === undefined) {
      blog.read_time_minutes = calculateReadTime(content);
    }
  }

  if (read_time_minutes !== undefined) {
    const parsed = parseInt(read_time_minutes, 10);
    if (!isNaN(parsed) && parsed > 0) {
      blog.read_time_minutes = parsed;
    }
  }

  if (excerpt !== undefined) {
    blog.excerpt = excerpt ? excerpt.trim() : null;
  }

  if (featured_image !== undefined) {
    blog.featured_image = featured_image?.trim() || null;
  }

  if (category !== undefined) {
    blog.category = category?.trim() || 'vedic-astrology';
  }

  if (tags !== undefined) {
    blog.tags = Array.isArray(tags) ? tags : [];
  }

  if (status !== undefined) {
    const validStatuses = ['draft', 'published', 'archived'];
    if (!validStatuses.includes(status)) {
      return next(new AppError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400));
    }
    blog.status = status;
    if (status === 'published' && !blog.published_at && !published_at) {
      blog.published_at = new Date();
    }
  }

  if (published_at !== undefined) {
    blog.published_at = published_at ? new Date(published_at) : null;
  }

  if (meta_title !== undefined) blog.meta_title = meta_title?.trim() || null;
  if (meta_description !== undefined) blog.meta_description = meta_description?.trim() || null;
  if (meta_keywords !== undefined) blog.meta_keywords = meta_keywords?.trim() || null;
  if (canonical_url !== undefined) blog.canonical_url = canonical_url?.trim() || null;

  await blog.save();

  const updatedBlog = await Blog.findByPk(blog.id, {
    include: [
      {
        model: Admin,
        as: 'author',
        attributes: ['id', 'email', 'name', 'role', 'avatar_url']
      }
    ]
  });

  res.status(200).json({
    success: true,
    message: 'Blog updated successfully',
    data: {
      blog: updatedBlog
    }
  });
});

/**
 * PATCH /api/v1/admin/blogs/:id/status
 * Quick toggle for blog publishing status.
 */
export const updateBlogStatus = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['draft', 'published', 'archived'];
  if (!status || !validStatuses.includes(status)) {
    return next(new AppError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400));
  }

  const blog = await Blog.findByPk(id);
  if (!blog) {
    return next(new AppError(`Blog with ID "${id}" not found.`, 404));
  }

  blog.status = status;
  if (status === 'published' && !blog.published_at) {
    blog.published_at = new Date();
  }

  await blog.save();

  res.status(200).json({
    success: true,
    message: `Blog status updated to "${status}"`,
    data: {
      id: blog.id,
      title: blog.title,
      status: blog.status,
      published_at: blog.published_at
    }
  });
});

/**
 * DELETE /api/v1/admin/blogs/:id
 * Soft deletes a blog article from the database.
 */
export const deleteBlog = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const blog = await Blog.findByPk(id);
  if (!blog) {
    return next(new AppError(`Blog with ID "${id}" not found.`, 404));
  }

  const blogTitle = blog.title;
  await blog.destroy(); // Soft delete via paranoid

  res.status(200).json({
    success: true,
    message: `Blog "${blogTitle}" has been deleted successfully`,
    data: {
      id: blog.id,
      deleted_at: new Date()
    }
  });
});
