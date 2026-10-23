import { QuestionPack } from '../models/index.js';
import { AppError } from '../utils/appError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * GET /api/v1/admin/question-packs
 * Retrieves all question packs with active/sort ordering.
 */
export const getQuestionPacks = asyncHandler(async (req, res) => {
  const { is_active, include_deleted } = req.query;

  const whereClause = {};

  if (is_active !== undefined) {
    whereClause.is_active = is_active === 'true' || is_active === true;
  }

  const paranoid = include_deleted !== 'true';

  const packs = await QuestionPack.findAll({
    where: whereClause,
    paranoid,
    order: [
      ['sort_order', 'ASC'],
      ['credits', 'ASC'],
      ['created_at', 'DESC']
    ]
  });

  res.status(200).json({
    success: true,
    message: 'Question packs retrieved successfully',
    data: {
      packs
    }
  });
});

/**
 * POST /api/v1/admin/question-packs
 * Creates a new question pack with multi-currency pricing.
 */
export const createQuestionPack = asyncHandler(async (req, res, next) => {
  const {
    name,
    credits,
    prices,
    code,
    title,
    tier,
    is_active,
    sort_order
  } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return next(new AppError('A valid pack name is required.', 400));
  }

  const parsedCredits = parseInt(credits, 10);
  if (isNaN(parsedCredits) || parsedCredits <= 0) {
    return next(new AppError('credits must be a positive integer greater than 0.', 400));
  }

  if (!prices || typeof prices !== 'object' || Array.isArray(prices) || Object.keys(prices).length === 0) {
    return next(
      new AppError('prices must be a valid JSON object containing currency pricing (e.g., {"INR": {"offerPrice": 699, "originalPrice": 1399}}).', 400)
    );
  }

  // Derive unique code if not explicitly passed
  const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
  const packCode = code?.trim()?.toLowerCase() || `pack_${cleanName}_${parsedCredits}`;

  const existingPack = await QuestionPack.findOne({
    where: { code: packCode },
    paranoid: false
  });

  if (existingPack) {
    return next(new AppError(`A question pack with code "${packCode}" already exists.`, 400));
  }

  const validTiers = ['silver', 'gold', 'diamond', 'custom'];
  const packTier = tier && validTiers.includes(tier.toLowerCase()) ? tier.toLowerCase() : 'silver';

  const newPack = await QuestionPack.create({
    code: packCode,
    name: name.trim(),
    title: title?.trim() || `${name.trim()} Pack (${parsedCredits} Questions)`,
    tier: packTier,
    credits: parsedCredits,
    prices,
    is_active: typeof is_active === 'boolean' ? is_active : true,
    sort_order: parseInt(sort_order, 10) || 0
  });

  res.status(201).json({
    success: true,
    message: 'Question pack created successfully',
    data: {
      pack: newPack
    }
  });
});

/**
 * PATCH /api/v1/admin/question-packs/:id
 * Updates pricing, credits, active status, or metadata of an existing pack.
 */
export const updateQuestionPack = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const {
    name,
    credits,
    prices,
    code,
    title,
    tier,
    is_active,
    sort_order
  } = req.body;

  const pack = await QuestionPack.findByPk(id);

  if (!pack) {
    return next(new AppError('Question pack not found with the provided ID.', 404));
  }

  const updates = {};

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      return next(new AppError('Pack name cannot be empty.', 400));
    }
    updates.name = name.trim();
  }

  if (credits !== undefined) {
    const parsedCredits = parseInt(credits, 10);
    if (isNaN(parsedCredits) || parsedCredits <= 0) {
      return next(new AppError('credits must be a positive integer greater than 0.', 400));
    }
    updates.credits = parsedCredits;
  }

  if (prices !== undefined) {
    if (!prices || typeof prices !== 'object' || Array.isArray(prices) || Object.keys(prices).length === 0) {
      return next(new AppError('prices must be a valid JSON object.', 400));
    }
    updates.prices = prices;
  }

  if (is_active !== undefined) {
    if (typeof is_active !== 'boolean') {
      return next(new AppError('is_active must be a boolean value.', 400));
    }
    updates.is_active = is_active;
  }

  if (code !== undefined) {
    const normalizedCode = code.trim().toLowerCase();
    if (normalizedCode !== pack.code) {
      const codeTaken = await QuestionPack.findOne({
        where: { code: normalizedCode },
        paranoid: false
      });
      if (codeTaken) {
        return next(new AppError(`Code "${normalizedCode}" is already in use by another pack.`, 400));
      }
      updates.code = normalizedCode;
    }
  }

  if (title !== undefined) updates.title = title?.trim();
  if (tier !== undefined) updates.tier = tier?.trim().toLowerCase();
  if (sort_order !== undefined) updates.sort_order = parseInt(sort_order, 10) || 0;

  await pack.update(updates);

  res.status(200).json({
    success: true,
    message: 'Question pack updated successfully',
    data: {
      pack
    }
  });
});

/**
 * DELETE /api/v1/admin/question-packs/:id
 * Soft deletes a question pack using paranoid deleted_at.
 */
export const deleteQuestionPack = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const pack = await QuestionPack.findByPk(id);

  if (!pack) {
    return next(new AppError('Question pack not found with the provided ID.', 404));
  }

  await pack.destroy();

  res.status(200).json({
    success: true,
    message: `Question pack "${pack.name}" (${pack.code}) soft-deleted successfully`,
    data: {
      id: pack.id,
      code: pack.code,
      deleted_at: pack.deleted_at
    }
  });
});
