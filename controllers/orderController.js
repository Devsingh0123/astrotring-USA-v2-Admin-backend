import { Op } from 'sequelize';
import { Order, User, Invoice } from '../models/index.js';
import { AppError } from '../utils/appError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * GET /api/v1/admin/orders
 * Lists orders with pagination, status filter, and multi-field search.
 */
export const getOrders = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const status = req.query.status?.trim()?.toLowerCase();
  const search = req.query.search?.trim();

  const whereClause = {};

  if (status) {
    whereClause.status = status;
  }

  if (search) {
    // Find matching user IDs by email to enable fast index search
    const matchingUsers = await User.findAll({
      where: {
        email: { [Op.like]: `%${search}%` }
      },
      attributes: ['id']
    });

    const matchedUserIds = matchingUsers.map((u) => u.id);

    const searchConditions = [
      { id: { [Op.like]: `%${search}%` } },
      { razorpay_order_id: { [Op.like]: `%${search}%` } }
    ];

    if (matchedUserIds.length > 0) {
      searchConditions.push({ user_id: { [Op.in]: matchedUserIds } });
    }

    whereClause[Op.or] = searchConditions;
  }

  const { count, rows } = await Order.findAndCountAll({
    where: whereClause,
    attributes: [
      'id',
      'user_id',
      'product_type',
      'product_code',
      'item_title',
      'credits_to_grant',
      'total_amount',
      'currency',
      'status',
      'razorpay_order_id',
      'payment_method',
      'created_at'
    ],
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['id', 'email']
      }
    ],
    limit,
    offset,
    order: [['created_at', 'DESC']]
  });

  res.status(200).json({
    success: true,
    message: 'Orders list retrieved',
    data: {
      orders: rows,
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
 * GET /api/v1/admin/orders/:id
 * Retrieves full order breakdown including linked invoice and buyer details.
 */
export const getOrderById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const order = await Order.findByPk(id, {
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['id', 'email', 'role', 'tier', 'credit_balance']
      },
      {
        model: Invoice,
        as: 'invoice'
      }
    ]
  });

  if (!order) {
    return next(new AppError('Order not found with the provided ID.', 404));
  }

  res.status(200).json({
    success: true,
    message: 'Order details retrieved',
    data: {
      order
    }
  });
});
