import { Op } from 'sequelize';
import { Admin } from '../models/index.js';
import { hashPassword } from '../utils/bcrypt.js';
import { AppError } from '../utils/appError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * GET /api/v1/admin/admins
 * Lists all staff administrator accounts with pagination and search.
 */
export const listAdmins = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const { search, role, status } = req.query;

  const whereClause = {};

  if (role && ['admin', 'super_admin'].includes(role.toLowerCase())) {
    whereClause.role = role.toLowerCase();
  }

  if (status === 'active') {
    whereClause.is_blocked = false;
  } else if (status === 'suspended') {
    whereClause.is_blocked = true;
  }

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    whereClause[Op.or] = [
      { name: { [Op.like]: term } },
      { email: { [Op.like]: term } }
    ];
  }

  const { count, rows: admins } = await Admin.findAndCountAll({
    where: whereClause,
    attributes: ['id', 'email', 'name', 'role', 'avatar_url', 'is_blocked', 'created_at', 'updated_at'],
    order: [['created_at', 'DESC']],
    limit,
    offset
  });

  const totalPages = Math.ceil(count / limit) || 1;

  res.status(200).json({
    success: true,
    message: 'Staff administrators retrieved successfully',
    data: {
      admins,
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
 * POST /api/v1/admin/admins
 * Creates a new administrative account (Super Admin only).
 */
export const createAdminUser = asyncHandler(async (req, res, next) => {
  const { email, password, name = 'Administrator', role = 'admin' } = req.body;

  if (!email || !password) {
    return next(new AppError('Email and initial password are required.', 400));
  }

  if (typeof password !== 'string' || password.length < 6) {
    return next(new AppError('Password must be at least 6 characters.', 400));
  }

  const normalizedEmail = email.trim().toLowerCase();
  const validRoles = ['admin', 'super_admin'];
  if (!validRoles.includes(role)) {
    return next(new AppError('Invalid role. Must be "admin" or "super_admin".', 400));
  }

  const existing = await Admin.findOne({ where: { email: normalizedEmail } });
  if (existing) {
    return next(new AppError(`An administrator with email "${normalizedEmail}" already exists.`, 409));
  }

  const hashedPassword = await hashPassword(password);

  const newAdmin = await Admin.create({
    email: normalizedEmail,
    password: hashedPassword,
    name: name.trim() || 'Administrator',
    role,
    is_blocked: false
  });

  res.status(201).json({
    success: true,
    message: `Administrator "${newAdmin.email}" created successfully`,
    data: {
      admin: {
        id: newAdmin.id,
        email: newAdmin.email,
        name: newAdmin.name,
        role: newAdmin.role,
        avatar_url: newAdmin.avatar_url,
        is_blocked: newAdmin.is_blocked,
        created_at: newAdmin.created_at
      }
    }
  });
});

/**
 * PATCH /api/v1/admin/admins/:id/role
 * Promotes or demotes an administrator between 'admin' and 'super_admin' (Super Admin only).
 */
export const updateAdminRole = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { role } = req.body;

  if (!role || !['admin', 'super_admin'].includes(role)) {
    return next(new AppError('Role must be either "admin" or "super_admin".', 400));
  }

  const targetAdmin = await Admin.findByPk(id);
  if (!targetAdmin) {
    return next(new AppError('Administrator account not found.', 404));
  }

  // Prevent super_admin from demoting themselves if they are the only super_admin
  if (req.user.id === targetAdmin.id && role !== 'super_admin') {
    const superAdminCount = await Admin.count({ where: { role: 'super_admin' } });
    if (superAdminCount <= 1) {
      return next(new AppError('Cannot demote your own account as you are the only Super Administrator.', 400));
    }
  }

  await targetAdmin.update({ role });

  res.status(200).json({
    success: true,
    message: `Administrator role updated to "${role}" successfully`,
    data: {
      admin: {
        id: targetAdmin.id,
        email: targetAdmin.email,
        name: targetAdmin.name,
        role: targetAdmin.role,
        updated_at: targetAdmin.updated_at
      }
    }
  });
});

/**
 * PATCH /api/v1/admin/admins/:id/status
 * Suspends or activates an administrator account (Super Admin only).
 */
export const updateAdminStatus = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { is_blocked } = req.body;

  if (typeof is_blocked !== 'boolean') {
    return next(new AppError('is_blocked must be a boolean value.', 400));
  }

  const targetAdmin = await Admin.findByPk(id);
  if (!targetAdmin) {
    return next(new AppError('Administrator account not found.', 404));
  }

  // Prevent self-suspension
  if (req.user.id === targetAdmin.id && is_blocked) {
    return next(new AppError('You cannot suspend your own administrator account.', 400));
  }

  await targetAdmin.update({ is_blocked });

  res.status(200).json({
    success: true,
    message: `Administrator account ${is_blocked ? 'suspended' : 'activated'} successfully`,
    data: {
      admin: {
        id: targetAdmin.id,
        email: targetAdmin.email,
        name: targetAdmin.name,
        role: targetAdmin.role,
        is_blocked: targetAdmin.is_blocked,
        updated_at: targetAdmin.updated_at
      }
    }
  });
});

/**
 * DELETE /api/v1/admin/admins/:id
 * Soft-deletes a staff administrator account (Super Admin only).
 */
export const deleteAdminUser = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const targetAdmin = await Admin.findByPk(id);
  if (!targetAdmin) {
    return next(new AppError('Administrator account not found.', 404));
  }

  // Prevent self-deletion
  if (req.user.id === targetAdmin.id) {
    return next(new AppError('You cannot delete your own administrator account.', 400));
  }

  await targetAdmin.destroy();

  res.status(200).json({
    success: true,
    message: `Administrator "${targetAdmin.email}" deleted successfully`,
    data: {
      id: targetAdmin.id,
      email: targetAdmin.email,
      deleted_at: new Date()
    }
  });
});
