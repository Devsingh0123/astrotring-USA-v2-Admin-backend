import { Op } from 'sequelize';
import { Order, User, Invoice } from '../models/index.js';
import { sequelize } from '../config/db.js';
import { razorpay } from '../config/razorpay.js';
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

/**
 * POST /api/v1/admin/orders/:id/refund
 * Triggers a refund through Razorpay and updates the order status to 'refunded'.
 */
export const refundOrder = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { amount, reason } = req.body || {};

  const order = await Order.findByPk(id);

  if (!order) {
    return next(new AppError('Order not found with the provided ID.', 404));
  }

  if (order.status === 'refunded') {
    return next(new AppError('Order has already been refunded.', 400));
  }

  if (order.status !== 'paid') {
    return next(
      new AppError(
        `Only paid orders can be refunded. Current status is "${order.status}".`,
        400
      )
    );
  }

  if (!order.razorpay_payment_id) {
    return next(
      new AppError('No Razorpay payment ID found associated with this order.', 400)
    );
  }

  // Calculate refund amount in subunits
  let refundSubunits = order.amount_subunits;
  if (amount !== undefined && amount !== null && amount !== '') {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return next(new AppError('Please provide a valid positive refund amount.', 400));
    }
    refundSubunits = Math.round(parsedAmount * 100);
    if (refundSubunits > order.amount_subunits) {
      return next(
        new AppError(
          `Refund amount cannot exceed the order total (${order.total_amount} ${order.currency}).`,
          400
        )
      );
    }
  }

  const refundOptions = {
    amount: refundSubunits,
    notes: {
      admin_id: req.user.id,
      admin_email: req.user.email,
      reason: reason || 'Refund initiated by administrator'
    }
  };

  let razorpayRefund;
  try {
    razorpayRefund = await razorpay.payments.refund(
      order.razorpay_payment_id,
      refundOptions
    );
  } catch (err) {
    const errorDesc =
      err.error?.description || err.description || err.message || 'Razorpay refund processing failed';
    return next(new AppError(`Razorpay Refund Error: ${errorDesc}`, 400));
  }

  // Execute database state update inside a managed transaction
  await sequelize.transaction(async (t) => {
    const lockedOrder = await Order.findByPk(order.id, {
      lock: t.LOCK.UPDATE,
      transaction: t
    });

    const user = await User.findByPk(lockedOrder.user_id, {
      lock: t.LOCK.UPDATE,
      transaction: t
    });

    // Reclaim granted credits if previously credited
    if (user && lockedOrder.is_credited) {
      if (lockedOrder.product_type === 'questions') {
        user.credit_balance = Math.max(0, user.credit_balance - lockedOrder.credits_to_grant);
      } else if (lockedOrder.product_type === 'report_pack') {
        user.report_credits = Math.max(0, user.report_credits - lockedOrder.credits_to_grant);
      }
      await user.save({ transaction: t });
    }

    lockedOrder.status = 'refunded';
    lockedOrder.is_credited = false;
    lockedOrder.failure_reason = reason || 'Admin refund processed';
    await lockedOrder.save({ transaction: t });

    // Update associated invoice status to REFUNDED
    await Invoice.update(
      { status: 'REFUNDED' },
      { where: { order_id: lockedOrder.id }, transaction: t }
    );
  });

  res.status(200).json({
    success: true,
    message: 'Order refunded successfully',
    data: {
      orderId: order.id,
      status: 'refunded',
      refund: {
        id: razorpayRefund.id,
        payment_id: razorpayRefund.payment_id,
        amount: razorpayRefund.amount / 100,
        currency: razorpayRefund.currency,
        status: razorpayRefund.status,
        created_at: razorpayRefund.created_at
      }
    }
  });
});
