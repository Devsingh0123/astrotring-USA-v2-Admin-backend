import { Op } from 'sequelize';
import { User, Order } from '../models/index.js';
import { sequelize } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * GET /api/v1/admin/dashboard
 * Aggregates core KPI metric cards and 7-day revenue/orders chart telemetry.
 */
export const getDashboardStats = asyncHandler(async (req, res) => {
  // 1. Metric Cards Aggregations
  const [
    totalUsers,
    totalPaidOrders,
    revenueResult,
    revenueByCurrency
  ] = await Promise.all([
    User.count({ where: { role: 'user' } }),
    Order.count({ where: { status: 'paid' } }),
    Order.sum('total_amount', { where: { status: 'paid' } }),
    Order.findAll({
      attributes: [
        'currency',
        [sequelize.fn('ROUND', sequelize.fn('SUM', sequelize.col('total_amount')), 2), 'revenue'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      where: { status: 'paid' },
      group: ['currency'],
      raw: true
    })
  ]);

  const totalRevenue = Number(parseFloat(revenueResult || 0).toFixed(2));

  // 2. 7-Day Range Calculation (inclusive of today)
  const now = new Date();
  const startDate = new Date();
  startDate.setDate(now.getDate() - 6);
  startDate.setHours(0, 0, 0, 0);

  // Group orders by date for the last 7 days
  const dailyStats = await Order.findAll({
    attributes: [
      [sequelize.fn('DATE', sequelize.col('created_at')), 'date'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'ordersCount'],
      [
        sequelize.fn(
          'ROUND',
          sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total_amount')), 0),
          2
        ),
        'revenue'
      ]
    ],
    where: {
      status: 'paid',
      created_at: {
        [Op.gte]: startDate
      }
    },
    group: [sequelize.fn('DATE', sequelize.col('created_at'))],
    order: [[sequelize.fn('DATE', sequelize.col('created_at')), 'ASC']],
    raw: true
  });

  // 3. Build a continuous 7-day series (ensuring days with zero transactions are included)
  const chartMap = new Map();
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(now.getDate() - i);
    const dateKey = d.toISOString().split('T')[0];
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    chartMap.set(dateKey, {
      date: dateKey,
      label,
      revenue: 0,
      ordersCount: 0
    });
  }

  dailyStats.forEach((row) => {
    const key =
      typeof row.date === 'string'
        ? row.date.split('T')[0]
        : new Date(row.date).toISOString().split('T')[0];

    if (chartMap.has(key)) {
      const entry = chartMap.get(key);
      entry.revenue = Number(parseFloat(row.revenue || 0).toFixed(2));
      entry.ordersCount = parseInt(row.ordersCount, 10) || 0;
    }
  });

  const chartData = Array.from(chartMap.values());

  res.status(200).json({
    success: true,
    message: 'Dashboard metrics and telemetry retrieved successfully',
    data: {
      metrics: {
        totalUsers,
        totalPaidOrders,
        totalRevenue,
        currency: 'INR',
        revenueByCurrency: revenueByCurrency.map((r) => ({
          currency: r.currency,
          revenue: Number(parseFloat(r.revenue || 0).toFixed(2)),
          count: parseInt(r.count, 10) || 0
        }))
      },
      chartData
    }
  });
});
