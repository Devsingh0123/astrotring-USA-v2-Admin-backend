import { Op } from 'sequelize';
import { Coupon } from '../models/index.js';
import { AppError } from '../utils/appError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * GET /api/v1/admin/coupons
 * Lists all coupons with usage metrics and filter options.
 */
export const getCoupons = asyncHandler(async (req, res) => {
  const { search, is_active } = req.query;

  const whereClause = {};

  if (search) {
    whereClause.code = {
      [Op.like]: `%${search.trim().toUpperCase()}%`
    };
  }

  if (is_active !== undefined) {
    whereClause.is_active = is_active === 'true' || is_active === true;
  }

  const coupons = await Coupon.findAll({
    where: whereClause,
    attributes: [
      'id',
      'code',
      'description',
      'discount_type',
      'discount_value',
      'applicable_products',
      'is_active',
      'expires_at',
      'max_uses',
      'used_count',
      'created_at',
      'updated_at'
    ],
    order: [['created_at', 'DESC']]
  });

  res.status(200).json({
    success: true,
    message: 'Coupons list retrieved',
    data: {
      coupons
    }
  });
});

/**
 * POST /api/v1/admin/coupons
 * Creates a new discount coupon code.
 */
export const createCoupon = asyncHandler(async (req, res, next) => {
  const {
    code,
    description,
    discount_type,
    discount_value,
    applicable_products,
    expires_at,
    max_uses
  } = req.body;

  if (!code || typeof code !== 'string' || !code.trim()) {
    return next(new AppError('A valid coupon code is required.', 400));
  }

  const normalizedCode = code.trim().toUpperCase();

  // Check code uniqueness
  const existingCoupon = await Coupon.findOne({ where: { code: normalizedCode } });
  if (existingCoupon) {
    return next(new AppError(`Coupon code "${normalizedCode}" already exists.`, 400));
  }

  const validTypes = ['pack_offer', 'percentage', 'flat'];
  if (!discount_type || !validTypes.includes(discount_type)) {
    return next(
      new AppError(`discount_type must be one of: ${validTypes.join(', ')}`, 400)
    );
  }

  const parsedValue = parseFloat(discount_value);
  if (isNaN(parsedValue) || parsedValue < 0) {
    return next(new AppError('discount_value must be a non-negative number.', 400));
  }

  if (discount_type === 'percentage' && parsedValue > 100) {
    return next(new AppError('Percentage discount cannot exceed 100%.', 400));
  }

  let parsedMaxUses = null;
  if (max_uses !== undefined && max_uses !== null && max_uses !== '') {
    parsedMaxUses = parseInt(max_uses, 10);
    if (isNaN(parsedMaxUses) || parsedMaxUses <= 0) {
      return next(new AppError('max_uses must be a positive integer.', 400));
    }
  }

  let parsedExpiresAt = null;
  if (expires_at) {
    const expiryDate = new Date(expires_at);
    if (isNaN(expiryDate.getTime())) {
      return next(new AppError('Invalid date format for expires_at.', 400));
    }
    parsedExpiresAt = expiryDate;
  }

  const newCoupon = await Coupon.create({
    code: normalizedCode,
    description: description?.trim() || `${normalizedCode} discount code`,
    discount_type,
    discount_value: parsedValue,
    applicable_products: Array.isArray(applicable_products) ? applicable_products : [],
    expires_at: parsedExpiresAt,
    max_uses: parsedMaxUses,
    is_active: true
  });

  res.status(201).json({
    success: true,
    message: 'Coupon created successfully',
    data: {
      coupon: newCoupon
    }
  });
});

/**
 * PATCH /api/v1/admin/coupons/:id/status
 * Enables or disables a coupon code.
 */
export const updateCouponStatus = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { is_active } = req.body;

  const coupon = await Coupon.findByPk(id);

  if (!coupon) {
    return next(new AppError('Coupon not found with the provided ID.', 404));
  }

  const newStatus = typeof is_active === 'boolean' ? is_active : !coupon.is_active;

  await coupon.update({ is_active: newStatus });

  res.status(200).json({
    success: true,
    message: `Coupon "${coupon.code}" ${newStatus ? 'enabled' : 'disabled'} successfully`,
    data: {
      id: coupon.id,
      code: coupon.code,
      is_active: coupon.is_active
    }
  });
});
