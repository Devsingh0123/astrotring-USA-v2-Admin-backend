import { AppError } from './appError.js';

export const ALLOWED_CURRENCIES = ['INR', 'USD'];

/**
 * Validates and sanitizes a multi-currency pricing payload.
 * Strictly permits ONLY 'INR' and 'USD'.
 * Rejects unsupported currencies or invalid price numbers.
 *
 * @param {Object} prices - Object mapping currency codes to { offerPrice, originalPrice }
 * @param {Object} [options]
 * @param {boolean} [options.requireBoth=false] - Whether both INR and USD are required
 * @returns {Object} Sanitized prices object with numeric values
 */
export function validateAndSanitizePrices(prices, { requireBoth = false } = {}) {
  if (!prices || typeof prices !== 'object' || Array.isArray(prices) || Object.keys(prices).length === 0) {
    throw new AppError(
      'prices must be a non-empty JSON object containing currency pricing (e.g., {"INR": {"offerPrice": 699, "originalPrice": 1399}, "USD": {"offerPrice": 7.99, "originalPrice": 14.99}}).',
      400
    );
  }

  const keys = Object.keys(prices);
  const invalidKeys = keys.filter((k) => !ALLOWED_CURRENCIES.includes(k));
  if (invalidKeys.length > 0) {
    throw new AppError(
      `Unsupported currency provided: ${invalidKeys.join(', ')}. AstroTring strictly supports only 'INR' and 'USD'.`,
      400
    );
  }

  if (requireBoth) {
    const missing = ALLOWED_CURRENCIES.filter((c) => !keys.includes(c));
    if (missing.length > 0) {
      throw new AppError(
        `Missing required currency pricing for: ${missing.join(', ')}. Both INR and USD must be provided.`,
        400
      );
    }
  }

  const sanitized = {};
  for (const curr of keys) {
    const entry = prices[curr];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new AppError(`Pricing details for currency ${curr} must be a valid object with offerPrice and originalPrice.`, 400);
    }

    const offer = parseFloat(entry.offerPrice);
    if (isNaN(offer) || offer <= 0) {
      throw new AppError(`Invalid offerPrice for ${curr}. It must be a positive number greater than 0.`, 400);
    }

    const orig = entry.originalPrice !== undefined && entry.originalPrice !== null && entry.originalPrice !== ''
      ? parseFloat(entry.originalPrice)
      : offer;

    if (isNaN(orig) || orig <= 0) {
      throw new AppError(`Invalid originalPrice for ${curr}. It must be a positive number greater than 0.`, 400);
    }

    if (offer > orig) {
      throw new AppError(`offerPrice (${offer}) cannot be greater than originalPrice (${orig}) for ${curr}.`, 400);
    }

    sanitized[curr] = {
      offerPrice: Number(offer),
      originalPrice: Number(orig)
    };
  }

  return sanitized;
}
