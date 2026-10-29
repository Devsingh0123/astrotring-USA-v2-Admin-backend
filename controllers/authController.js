import { Admin } from '../models/index.js';
import { comparePassword } from '../utils/bcrypt.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { AppError } from '../utils/appError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

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
