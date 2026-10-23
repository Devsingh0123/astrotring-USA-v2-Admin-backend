import { User } from '../models/index.js';
import { comparePassword } from '../utils/bcrypt.js';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt.js';
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

  // Find user by email
  const user = await User.findOne({ where: { email: normalizedEmail } });

  if (!user || user.role !== 'admin') {
    return next(new AppError('Invalid email or password.', 401));
  }

  if (user.is_blocked) {
    return next(new AppError('Your administrator account has been suspended.', 403));
  }

  if (!user.password) {
    return next(new AppError('Password has not been configured for this administrator account.', 400));
  }

  const isPasswordValid = await comparePassword(password, user.password);
  if (!isPasswordValid) {
    return next(new AppError('Invalid email or password.', 401));
  }

  // Generate tokens
  const tokenPayload = {
    id: user.id,
    email: user.email,
    role: user.role
  };

  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken({ id: user.id });

  res.status(200).json({
    success: true,
    message: 'Admin logged in successfully',
    data: {
      admin: {
        id: user.id,
        email: user.email,
        role: user.role
      },
      accessToken,
      refreshToken
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
        role: req.user.role,
        created_at: req.user.created_at
      }
    }
  });
});
