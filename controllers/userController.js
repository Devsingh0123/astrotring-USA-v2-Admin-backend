import { Op } from 'sequelize';
import { User, BirthDetail } from '../models/index.js';
import { AppError } from '../utils/appError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * GET /api/v1/admin/users
 * Lists users with pagination and email search filter.
 */
export const getUsers = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;
  const search = req.query.search?.trim();

  const whereClause = {};

  if (search) {
    whereClause.email = {
      [Op.like]: `%${search}%`
    };
  }

  const { count, rows } = await User.findAndCountAll({
    where: whereClause,
    attributes: [
      'id',
      'email',
      'role',
      'credit_balance',
      'report_credits',
      'tier',
      'is_blocked',
      'is_email_verified',
      'onboarding_completed',
      'created_at'
    ],
    limit,
    offset,
    order: [['created_at', 'DESC']]
  });

  res.status(200).json({
    success: true,
    message: 'Users list retrieved',
    data: {
      users: rows,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit) || 1
      }
    }
  });
});

/**
 * GET /api/v1/admin/users/:id
 * Fetches user profile including birth_details.
 * STRICT: Does NOT load or return the ~1MB chart_data from birth_charts.
 */
export const getUserById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const user = await User.findByPk(id, {
    attributes: {
      exclude: ['password']
    },
    include: [
      {
        model: BirthDetail,
        as: 'birth_details',
        attributes: [
          'id',
          'profile_type',
          'is_primary',
          'full_name',
          'gender',
          'date_of_birth',
          'time_of_birth',
          'is_time_unknown',
          'birth_city',
          'latitude',
          'longitude',
          'timezone',
          'chart_id',
          'created_at',
          'updated_at'
        ]
      }
    ]
  });

  if (!user) {
    return next(new AppError('User not found with the provided ID.', 404));
  }

  res.status(200).json({
    success: true,
    message: 'User details retrieved',
    data: {
      user
    }
  });
});

/**
 * PATCH /api/v1/admin/users/:id/status
 * Blocks or unblocks a user account.
 */
export const updateUserStatus = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { is_blocked } = req.body;

  if (typeof is_blocked !== 'boolean') {
    return next(new AppError('Please provide a boolean value for is_blocked.', 400));
  }

  const user = await User.findByPk(id);

  if (!user) {
    return next(new AppError('User not found with the provided ID.', 404));
  }

  // Prevent admin from blocking their own account
  if (req.user.id === user.id && is_blocked) {
    return next(new AppError('You cannot suspend your own administrator account.', 400));
  }

  await user.update({ is_blocked });

  res.status(200).json({
    success: true,
    message: `User ${is_blocked ? 'suspended' : 'activated'} successfully`,
    data: {
      id: user.id,
      email: user.email,
      role: user.role,
      is_blocked: user.is_blocked
    }
  });
});
