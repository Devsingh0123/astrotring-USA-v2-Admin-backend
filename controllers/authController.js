import { Admin } from '../models/index.js';
import { hashPassword, comparePassword } from '../utils/bcrypt.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { AppError } from '../utils/appError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sequelize } from '../config/db.js';

/**
 * POST /api/v1/admin/auth/login
 * Email + Password login specifically for administrators.
 */
export const login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new AppError('Please provide both email and password.', 400));
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Find admin in dedicated admins table
  const admin = await Admin.findOne({ where: { email: normalizedEmail } });

  if (!admin || !['admin', 'super_admin'].includes(admin.role)) {
    return next(new AppError('Invalid email or password.', 401));
  }

  if (admin.is_blocked) {
    return next(new AppError('Your administrator account has been suspended.', 403));
  }

  if (!admin.password) {
    return next(new AppError('Password has not been configured for this administrator account.', 400));
  }

  const isPasswordValid = await comparePassword(password, admin.password);
  if (!isPasswordValid) {
    return next(new AppError('Invalid email or password.', 401));
  }

  // Generate tokens
  const tokenPayload = {
    id: admin.id,
    email: admin.email,
    role: admin.role
  };

  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken({ id: admin.id });

  res.status(200).json({
    success: true,
    message: 'Admin logged in successfully',
    data: {
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        avatar_url: admin.avatar_url
      },
      accessToken,
      refreshToken
    }
  });
});

/**
 * POST /api/v1/admin/auth/refresh-token
 * Issues a new access token using a valid unexpired refresh token.
 */
export const refreshToken = asyncHandler(async (req, res, next) => {
  const { refreshToken: rawToken } = req.body;

  if (!rawToken) {
    return next(new AppError('Refresh token is required.', 400));
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(rawToken);
  } catch (err) {
    return next(new AppError('Invalid or expired refresh token. Please sign in again.', 401));
  }

  const admin = await Admin.findByPk(decoded.id);

  if (!admin || !['admin', 'super_admin'].includes(admin.role)) {
    return next(new AppError('Administrator account not found or access denied.', 401));
  }

  if (admin.is_blocked) {
    return next(new AppError('Your administrator account has been suspended.', 403));
  }

  const tokenPayload = {
    id: admin.id,
    email: admin.email,
    role: admin.role
  };

  const newAccessToken = generateAccessToken(tokenPayload);

  res.status(200).json({
    success: true,
    message: 'Access token refreshed successfully',
    data: {
      accessToken: newAccessToken
    }
  });
});

/**
 * GET /api/v1/admin/auth/me
 * Retrieves current admin profile (protected by adminAuth).
 */
export const getMe = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Admin profile retrieved',
    data: {
      admin: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        role: req.user.role,
        avatar_url: req.user.avatar_url,
        created_at: req.user.created_at
      }
    }
  });
});

/**
 * PATCH /api/v1/admin/auth/profile
 * Updates the authenticated administrator's display name or avatar.
 */
export const updateProfile = asyncHandler(async (req, res, next) => {
  const { name, avatar_url } = req.body;

  const admin = await Admin.findByPk(req.user.id);
  if (!admin) {
    return next(new AppError('Administrator account not found.', 404));
  }

  const updates = {};
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      return next(new AppError('Please provide a valid display name.', 400));
    }
    updates.name = name.trim();
  }

  if (avatar_url !== undefined) {
    updates.avatar_url = avatar_url?.trim() || null;
  }

  await admin.update(updates);

  res.status(200).json({
    success: true,
    message: 'Admin profile updated successfully',
    data: {
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        avatar_url: admin.avatar_url,
        updated_at: admin.updated_at
      }
    }
  });
});

/**
 * POST /api/v1/admin/auth/change-password
 * Changes the authenticated administrator's password after verifying their current password.
 */
export const changePassword = asyncHandler(async (req, res, next) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return next(new AppError('Please provide both current and new password.', 400));
  }

  if (typeof new_password !== 'string' || new_password.length < 6) {
    return next(new AppError('New password must be at least 6 characters long.', 400));
  }

  const admin = await Admin.findByPk(req.user.id);
  if (!admin) {
    return next(new AppError('Administrator account not found.', 404));
  }

  const isCurrentValid = await comparePassword(current_password, admin.password);
  if (!isCurrentValid) {
    return next(new AppError('Current password is incorrect.', 401));
  }

  const hashedPassword = await hashPassword(new_password);
  await admin.update({ password: hashedPassword });

  res.status(200).json({
    success: true,
    message: 'Password changed successfully'
  });
});

/**
 * GET /api/v1/admin/auth/system-status
 * Health, runtime environment, and connectivity metrics for Settings view.
 */
export const getSystemStatus = asyncHandler(async (req, res) => {
  let dbLatency = -1;
  let dbStatus = 'healthy';
  try {
    const start = Date.now();
    await sequelize.query('SELECT 1');
    dbLatency = Date.now() - start;
  } catch (err) {
    dbStatus = 'degraded';
  }

  const memory = process.memoryUsage();

  res.status(200).json({
    success: true,
    message: 'System status retrieved',
    data: {
      service: 'japaika-admin-backend',
      environment: process.env.NODE_ENV || 'development',
      node_version: process.version,
      uptime_seconds: Math.floor(process.uptime()),
      memory: {
        rss_mb: Math.round(memory.rss / (1024 * 1024)),
        heap_used_mb: Math.round(memory.heapUsed / (1024 * 1024)),
        heap_total_mb: Math.round(memory.heapTotal / (1024 * 1024))
      },
      database: {
        engine: 'MySQL',
        status: dbStatus,
        latency_ms: dbLatency
      },
      integrations: {
        cloudinary: Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY),
        razorpay: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
      }
    }
  });
});
