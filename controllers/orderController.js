import { Op } from 'sequelize';
import { Order, User, Invoice } from '../models/index.js';
import { sequelize } from '../config/db.js';
import { razorpay } from '../config/razorpay.js';
import { BRAND } from '../config/brand.js';
import { AppError } from '../utils/appError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { buildCsv } from '../utils/csvHelper.js';

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

/**
 * Helper: Generates self-contained, print-ready HTML tax invoice.
 */
export function generateInvoiceHtml(invoice, order) {
  const isPaid = invoice.status === 'PAID';
  const statusColor = isPaid ? '#10b981' : invoice.status === 'REFUNDED' ? '#ef4444' : '#f59e0b';
  const symbol = invoice.currency === 'USD' ? '$' : '₹';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${BRAND.NAME} Tax Invoice - ${invoice.invoice_number}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    body { background-color: #f8fafc; color: #0f172a; padding: 40px 20px; }
    .invoice-card { max-width: 800px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 48px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e2e8f0; padding-bottom: 24px; margin-bottom: 32px; }
    .brand-title { font-size: 24px; font-weight: 800; color: #ff852e; letter-spacing: -0.5px; }
    .brand-sub { font-size: 13px; color: #64748b; margin-top: 4px; }
    .invoice-tag { text-align: right; }
    .invoice-title { font-size: 22px; font-weight: 700; color: #0f172a; }
    .invoice-num { font-size: 13px; font-family: monospace; color: #64748b; margin-top: 4px; }
    .status-badge { display: inline-block; padding: 4px 10px; font-size: 11px; font-weight: 700; text-transform: uppercase; border-radius: 9999px; color: #fff; background: ${statusColor}; margin-top: 8px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 36px; }
    .meta-col h4 { font-size: 12px; text-transform: uppercase; color: #94a3b8; font-weight: 700; letter-spacing: 0.5px; margin-bottom: 8px; }
    .meta-col p { font-size: 14px; line-height: 1.6; color: #334155; }
    .table-container { width: 100%; border-collapse: collapse; margin-bottom: 32px; }
    .table-container th { background: #f1f5f9; color: #475569; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; padding: 12px 16px; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; }
    .table-container td { padding: 16px; border-bottom: 1px solid #f1f5f9; font-size: 14px; color: #1e293b; }
    .amount-col { text-align: right; }
    .summary-section { display: flex; justify-content: flex-end; margin-bottom: 40px; }
    .summary-table { width: 320px; }
    .summary-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; color: #64748b; }
    .summary-row.total { border-top: 2px solid #e2e8f0; padding-top: 12px; font-size: 18px; font-weight: 800; color: #0f172a; }
    .footer { border-top: 1px solid #e2e8f0; padding-top: 24px; font-size: 12px; color: #94a3b8; text-align: center; line-height: 1.6; }
    .actions-bar { max-width: 800px; margin: 0 auto 20px auto; display: flex; justify-content: flex-end; gap: 12px; }
    .btn-print { background: #ff852e; color: #ffffff; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 2px 4px rgba(255, 133, 46, 0.25); }
    .btn-print:hover { background: #e06c19; }
    @media print {
      body { background: #ffffff; padding: 0; }
      .invoice-card { border: none; box-shadow: none; padding: 0; }
      .actions-bar { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="actions-bar no-print">
    <button class="btn-print" onclick="window.print()">
      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2m-12 0v4h12v-4M6 14h12"/></svg>
      Print / Save as PDF
    </button>
  </div>

  <div class="invoice-card">
    <div class="header">
      <div>
        <div class="brand-title">${BRAND.NAME}</div>
        <div class="brand-sub">${BRAND.TAGLINE}</div>
        <div class="brand-sub">${BRAND.SUPPORT_EMAIL} | ${BRAND.USER_FRONTEND_DOMAIN}</div>
      </div>
      <div class="invoice-tag">
        <div class="invoice-title">TAX INVOICE</div>
        <div class="invoice-num">${invoice.invoice_number}</div>
        <div><span class="status-badge">${invoice.status}</span></div>
      </div>
    </div>

    <div class="meta-grid">
      <div class="meta-col">
        <h4>Billed To (Customer):</h4>
        <p><strong>${invoice.customer_name || 'Valued Customer'}</strong></p>
        <p>${invoice.customer_email}</p>
        <p>Place of Supply: <strong>${invoice.billing_state || 'Standard'}</strong></p>
      </div>
      <div class="meta-col" style="text-align: right;">
        <h4>Invoice Details:</h4>
        <p>Date of Issue: <strong>${new Date(invoice.issued_at || invoice.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</strong></p>
        <p>Order ID: <code style="font-size: 11px;">${order.id}</code></p>
        <p>Payment Ref: <code style="font-size: 11px;">${invoice.razorpay_payment_id || order.razorpay_payment_id || 'N/A'}</code></p>
      </div>
    </div>

    <table class="table-container">
      <thead>
        <tr>
          <th>Item & Description</th>
          <th>SAC Code</th>
          <th class="amount-col">Taxable Value</th>
          <th class="amount-col">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <strong>${invoice.item_title}</strong>
            <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Service Type: ${invoice.item_type === 'report_pack' ? 'Astrological Consultation Report' : 'Jyotish Question Consultation'}</div>
          </td>
          <td><code>${invoice.sac_code || '998431'}</code></td>
          <td class="amount-col">${symbol}${Number(invoice.taxable_amount || invoice.subtotal).toFixed(2)}</td>
          <td class="amount-col"><strong>${symbol}${Number(invoice.taxable_amount || invoice.subtotal).toFixed(2)}</strong></td>
        </tr>
      </tbody>
    </table>

    <div class="summary-section">
      <div class="summary-table">
        <div class="summary-row">
          <span>Subtotal:</span>
          <span>${symbol}${Number(invoice.subtotal).toFixed(2)}</span>
        </div>
        ${Number(invoice.discount) > 0 ? `
        <div class="summary-row" style="color: #10b981;">
          <span>Discount (${invoice.coupon_code || 'Promo'}):</span>
          <span>-${symbol}${Number(invoice.discount).toFixed(2)}</span>
        </div>` : ''}
        <div class="summary-row">
          <span>Taxable Amount:</span>
          <span>${symbol}${Number(invoice.taxable_amount).toFixed(2)}</span>
        </div>
        ${Number(invoice.cgst) > 0 ? `
        <div class="summary-row">
          <span>CGST (9%):</span>
          <span>${symbol}${Number(invoice.cgst).toFixed(2)}</span>
        </div>` : ''}
        ${Number(invoice.sgst) > 0 ? `
        <div class="summary-row">
          <span>SGST (9%):</span>
          <span>${symbol}${Number(invoice.sgst).toFixed(2)}</span>
        </div>` : ''}
        ${Number(invoice.igst) > 0 ? `
        <div class="summary-row">
          <span>IGST (18%):</span>
          <span>${symbol}${Number(invoice.igst).toFixed(2)}</span>
        </div>` : ''}
        ${Number(invoice.tax_amount) > 0 && Number(invoice.cgst) === 0 && Number(invoice.igst) === 0 ? `
        <div class="summary-row">
          <span>Taxes:</span>
          <span>${symbol}${Number(invoice.tax_amount).toFixed(2)}</span>
        </div>` : ''}
        <div class="summary-row total">
          <span>Total Paid:</span>
          <span>${symbol}${Number(invoice.total).toFixed(2)}</span>
        </div>
      </div>
    </div>

    <div class="footer">
      <p>This is a computer-generated tax invoice. No signature is required.</p>
      <p>Thank you for choosing ${BRAND.NAME} for your Vedic astrological guidance.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * GET /api/v1/admin/orders/:id/invoice
 * Retrieves full linked invoice for an order. Supports format=html for printable view.
 */
export const getOrderInvoice = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { format } = req.query;

  const order = await Order.findByPk(id, {
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['id', 'email', 'role', 'tier']
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

  if (!order.invoice) {
    return next(new AppError('No invoice found for this order. (Order may not be paid or settled).', 404));
  }

  if (format === 'html' || req.headers.accept?.includes('text/html')) {
    const html = generateInvoiceHtml(order.invoice, order);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  }

  res.status(200).json({
    success: true,
    message: 'Invoice retrieved successfully',
    data: {
      invoice: order.invoice,
      order: {
        id: order.id,
        status: order.status,
        currency: order.currency,
        total_amount: order.total_amount,
        created_at: order.created_at
      }
    }
  });
});

/**
 * GET /api/v1/admin/orders/export
 * Exports orders matching filter criteria as RFC 4180 CSV with UTF-8 BOM.
 */
export const exportOrders = asyncHandler(async (req, res) => {
  const { status, currency, product_type, from, to, search } = req.query;

  const whereClause = {};

  if (status) {
    whereClause.status = status.trim().toLowerCase();
  }

  if (currency) {
    whereClause.currency = currency.trim().toUpperCase();
  }

  if (product_type) {
    whereClause.product_type = product_type.trim();
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
    const trimmed = search.trim();
    const matchingUsers = await User.findAll({
      where: {
        email: { [Op.like]: `%${trimmed}%` }
      },
      attributes: ['id']
    });

    const matchedUserIds = matchingUsers.map((u) => u.id);

    const searchConditions = [
      { id: { [Op.like]: `%${trimmed}%` } },
      { razorpay_order_id: { [Op.like]: `%${trimmed}%` } }
    ];

    if (matchedUserIds.length > 0) {
      searchConditions.push({ user_id: { [Op.in]: matchedUserIds } });
    }

    whereClause[Op.or] = searchConditions;
  }

  const orders = await Order.findAll({
    where: whereClause,
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['id', 'email']
      },
      {
        model: Invoice,
        as: 'invoice',
        attributes: ['id', 'invoice_number']
      }
    ],
    order: [['created_at', 'DESC']],
    limit: 50000
  });

  const headers = [
    'Order ID',
    'Created At (UTC)',
    'User Email',
    'Product Type',
    'Product Code',
    'Item Title',
    'Credits Granted',
    'Currency',
    'Subtotal',
    'Discount Amount',
    'Coupon Code',
    'Taxable Amount',
    'CGST',
    'SGST',
    'IGST',
    'Tax Amount',
    'Total Amount',
    'Status',
    'Payment Method',
    'Razorpay Order ID',
    'Razorpay Payment ID',
    'Invoice Number'
  ];

  const rows = orders.map((o) => {
    return [
      o.id,
      o.created_at || o.createdAt,
      o.user?.email || '',
      o.product_type,
      o.product_code,
      o.item_title,
      o.credits_to_grant,
      o.currency,
      o.subtotal,
      o.discount_amount,
      o.coupon_code || '',
      o.taxable_amount,
      o.cgst,
      o.sgst,
      o.igst,
      o.tax_amount,
      o.total_amount,
      o.status,
      o.payment_method || '',
      o.razorpay_order_id || '',
      o.razorpay_payment_id || '',
      o.invoice?.invoice_number || ''
    ];
  });

  const csvContent = buildCsv(headers, rows);
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `${BRAND.SLUG}-orders-${dateStr}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(csvContent);
});
