import { Op } from 'sequelize';
import { User, BirthDetail } from '../models/index.js';
import { AppError } from '../utils/appError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { buildCsv } from '../utils/csvHelper.js';

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
      'createdAt',
      'created_at'
    ],
    limit,
    offset,
    order: [['created_at', 'DESC']]
  });

  const formattedUsers = rows.map((u) => {
    const userObj = u.toJSON ? u.toJSON() : u;
    if (userObj.createdAt && !userObj.created_at) {
      userObj.created_at = userObj.createdAt;
    }
    return userObj;
  });

  res.status(200).json({
    success: true,
    message: 'Users list retrieved',
    data: {
      users: formattedUsers,
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

  const userData = user.toJSON();
  if (userData.createdAt && !userData.created_at) {
    userData.created_at = userData.createdAt;
  }
  if (userData.updatedAt && !userData.updated_at) {
    userData.updated_at = userData.updatedAt;
  }

  res.status(200).json({
    success: true,
    message: 'User details retrieved',
    data: {
      user: userData
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
  if ((req.user.id === user.id || req.user.email === user.email) && is_blocked) {
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

/**
 * PATCH /api/v1/admin/users/:id/credits
 * Manually adjusts question credits (`credit_balance`) or report credits (`report_credits`) for a user.
 */
export const adjustUserCredits = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { credit_type = 'questions', action = 'add', amount, reason = '' } = req.body;

  const validTypes = ['questions', 'reports', 'credit_balance', 'report_credits'];
  const normalizedType = credit_type?.toLowerCase();
  if (!normalizedType || !validTypes.includes(normalizedType)) {
    return next(new AppError('Invalid credit_type. Must be "questions" or "reports".', 400));
  }

  const validActions = ['add', 'deduct', 'credit', 'debit', 'set'];
  const normalizedAction = action?.toLowerCase();
  if (!normalizedAction || !validActions.includes(normalizedAction)) {
    return next(new AppError('Invalid action. Must be "add", "deduct", or "set".', 400));
  }

  const parsedAmount = parseInt(amount, 10);
  if (
    isNaN(parsedAmount) ||
    (normalizedAction !== 'set' && parsedAmount <= 0) ||
    (normalizedAction === 'set' && parsedAmount < 0)
  ) {
    return next(new AppError('Amount must be a positive integer (or 0 if action is "set").', 400));
  }

  const user = await User.findByPk(id);
  if (!user) {
    return next(new AppError('User not found with the provided ID.', 404));
  }

  const isQuestionCredit = normalizedType === 'questions' || normalizedType === 'credit_balance';
  const targetField = isQuestionCredit ? 'credit_balance' : 'report_credits';
  const previousBalance = user[targetField] || 0;
  let newBalance = previousBalance;

  if (normalizedAction === 'add' || normalizedAction === 'credit') {
    newBalance = previousBalance + parsedAmount;
  } else if (normalizedAction === 'deduct' || normalizedAction === 'debit') {
    newBalance = Math.max(0, previousBalance - parsedAmount);
  } else if (normalizedAction === 'set') {
    newBalance = parsedAmount;
  }

  await user.update({ [targetField]: newBalance });

  res.status(200).json({
    success: true,
    message: `User ${isQuestionCredit ? 'question' : 'report'} credits adjusted successfully`,
    data: {
      user: {
        id: user.id,
        email: user.email,
        credit_balance: user.credit_balance,
        report_credits: user.report_credits,
        adjustment: {
          field: targetField,
          credit_type: isQuestionCredit ? 'questions' : 'reports',
          action: normalizedAction,
          amount: parsedAmount,
          previous_balance: previousBalance,
          new_balance: newBalance,
          reason: reason?.trim() || null,
          adjusted_by: req.user?.email || 'admin'
        }
      }
    }
  });
});

/**
 * GET /api/v1/admin/users/export
 * Exports users matching filter criteria as RFC 4180 CSV with UTF-8 BOM.
 */
export const exportUsers = asyncHandler(async (req, res) => {
  const { tier, is_blocked, is_email_verified, from, to, search } = req.query;

  const whereClause = {};

  if (tier) {
    whereClause.tier = tier.trim().toLowerCase();
  }

  if (is_blocked !== undefined) {
    whereClause.is_blocked = is_blocked === 'true' || is_blocked === true;
  }

  if (is_email_verified !== undefined) {
    whereClause.is_email_verified = is_email_verified === 'true' || is_email_verified === true;
  }

  if (from || to) {
    whereClause.created_at = {};
    if (from) {
      whereClause.created_at[Op.gte] = new Date(from);
    }
    if (to) {
      const toDate = new Date(to);
      if (!to.includes('T')) {
        toDate.setHours(23, 59, 59, 999);
      }
      whereClause.created_at[Op.lte] = toDate;
    }
  }

  if (search) {
    whereClause.email = {
      [Op.like]: `%${search.trim()}%`
    };
  }

  const users = await User.findAll({
    where: whereClause,
    attributes: [
      'id',
      'email',
      'role',
      'tier',
      'credit_balance',
      'report_credits',
      'is_email_verified',
      'onboarding_completed',
      'is_blocked',
      'created_at',
      'createdAt'
    ],
    order: [['created_at', 'DESC']],
    limit: 50000
  });

  const headers = [
    'User ID',
    'Email',
    'Role',
    'Tier',
    'Question Balance',
    'Report Credits',
    'Email Verified',
    'Onboarding Completed',
    'Blocked',
    'Created At (UTC)'
  ];

  const rows = users.map((u) => {
    return [
      u.id,
      u.email,
      u.role,
      u.tier,
      u.credit_balance,
      u.report_credits,
      u.is_email_verified ? 'Yes' : 'No',
      u.onboarding_completed ? 'Yes' : 'No',
      u.is_blocked ? 'Yes' : 'No',
      u.created_at || u.createdAt
    ];
  });

  const csvContent = buildCsv(headers, rows);
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `japaika-users-${dateStr}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(csvContent);
});

