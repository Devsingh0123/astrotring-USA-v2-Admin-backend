import { Op, fn, col } from 'sequelize';
import { ChatThread, ChatMessage, User } from '../models/index.js';
import { AppError } from '../utils/appError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * GET /api/v1/admin/chats
 * Lists AI conversation threads with pagination, search, engine, and date filters.
 */
export const getChatThreads = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const { search, engine, from, to } = req.query;

  const whereClause = {};

  if (engine && ['jyotish', 'shastra'].includes(engine.toLowerCase())) {
    whereClause.engine = engine.toLowerCase();
  }

  if (from || to) {
    whereClause.created_at = {};
    if (from) whereClause.created_at[Op.gte] = new Date(from);
    if (to) whereClause.created_at[Op.lte] = new Date(to);
  }

  const userWhereClause = {};
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    whereClause[Op.or] = [
      { title: { [Op.like]: term } },
      { '$user.email$': { [Op.like]: term } }
    ];
  }

  const { count, rows: threads } = await ChatThread.findAndCountAll({
    where: whereClause,
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['id', 'email', 'role', 'tier'],
        required: false
      },
      {
        model: ChatMessage,
        as: 'messages',
        attributes: ['id', 'role', 'feedback', 'tokens_used', 'credits_debited', 'created_at']
      }
    ],
    order: [['created_at', 'DESC']],
    limit,
    offset,
    distinct: true
  });

  // Format threads with summary metrics
  const formattedThreads = threads.map((thread) => {
    const raw = thread.toJSON();
    const messages = raw.messages || [];
    const messageCount = messages.length;
    const userMessageCount = messages.filter((m) => m.role === 'user').length;
    const assistantMessageCount = messages.filter((m) => m.role === 'assistant').length;
    const totalTokens = messages.reduce((acc, m) => acc + (m.tokens_used || 0), 0);
    const totalCredits = messages.reduce((acc, m) => acc + (m.credits_debited || 0), 0);
    const feedbackCounts = {
      positive: messages.filter((m) => m.feedback === 'yes').length,
      negative: messages.filter((m) => m.feedback === 'no').length
    };

    delete raw.messages;

    return {
      ...raw,
      message_count: messageCount,
      user_message_count: userMessageCount,
      assistant_message_count: assistantMessageCount,
      total_tokens_used: totalTokens,
      total_credits_debited: totalCredits,
      feedback: feedbackCounts
    };
  });

  const totalPages = Math.ceil(count / limit) || 1;

  res.status(200).json({
    success: true,
    message: 'Chat threads retrieved successfully',
    data: {
      threads: formattedThreads,
      pagination: {
        total: count,
        page,
        limit,
        totalPages
      }
    }
  });
});

/**
 * GET /api/v1/admin/chats/stats
 * Aggregates high-level conversation metrics for the monitoring dashboard.
 */
export const getChatStats = asyncHandler(async (req, res) => {
  const [
    totalThreads,
    jyotishThreads,
    shastraThreads,
    totalMessages,
    tokenSum,
    positiveFeedback,
    negativeFeedback
  ] = await Promise.all([
    ChatThread.count(),
    ChatThread.count({ where: { engine: 'jyotish' } }),
    ChatThread.count({ where: { engine: 'shastra' } }),
    ChatMessage.count(),
    ChatMessage.sum('tokens_used'),
    ChatMessage.count({ where: { feedback: 'yes' } }),
    ChatMessage.count({ where: { feedback: 'no' } })
  ]);

  res.status(200).json({
    success: true,
    message: 'Chat stats retrieved successfully',
    data: {
      threads: {
        total: totalThreads,
        jyotish: jyotishThreads,
        shastra: shastraThreads
      },
      messages: {
        total: totalMessages,
        total_tokens_used: tokenSum || 0
      },
      feedback: {
        positive: positiveFeedback,
        negative: negativeFeedback,
        satisfaction_rate:
          positiveFeedback + negativeFeedback > 0
            ? Math.round((positiveFeedback / (positiveFeedback + negativeFeedback)) * 100)
            : 100
      }
    }
  });
});

/**
 * GET /api/v1/admin/chats/:id
 * Retrieves full conversation turn history for auditing and QA.
 */
export const getChatThreadById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const thread = await ChatThread.findByPk(id, {
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['id', 'email', 'role', 'tier', 'credit_balance', 'report_credits']
      },
      {
        model: ChatMessage,
        as: 'messages',
        attributes: [
          'id',
          'role',
          'content',
          'structured_data',
          'feedback',
          'tokens_used',
          'credits_debited',
          'created_at'
        ]
      }
    ],
    order: [[{ model: ChatMessage, as: 'messages' }, 'created_at', 'ASC']]
  });

  if (!thread) {
    return next(new AppError('Chat thread not found with the provided ID.', 404));
  }

  res.status(200).json({
    success: true,
    message: 'Chat thread conversation retrieved successfully',
    data: {
      thread
    }
  });
});
