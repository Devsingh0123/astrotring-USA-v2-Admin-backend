/**
 * Centralized Brand & Domain Configuration — Japaika Admin Backend
 * Single source of truth for service identifiers, CORS origins, invoice headers,
 * CSV filenames, and Cloudinary upload folders.
 */
export const BRAND = {
  NAME: process.env.BRAND_NAME || 'Japaika',
  SLUG: 'japaika',
  SERVICE_NAME: 'japaika-admin-backend',
  TAGLINE: 'Vedic Astrological Intelligence Platform',
  SUPPORT_EMAIL: process.env.SUPPORT_EMAIL || 'support@japaika.com',
  DEFAULT_ADMIN_EMAIL: 'admin@japaika.com',
  DEFAULT_ADMIN_NAME: 'Japaika Administrator',
  ADMIN_FRONTEND_URL: process.env.ADMIN_FRONTEND_URL || 'https://admin.japaika.com',
  ADMIN_BACKEND_URL: process.env.ADMIN_BACKEND_URL || 'https://adminbackend.japaika.com',
  USER_FRONTEND_DOMAIN: 'japaika.com',
  USER_FRONTEND_URL: process.env.USER_FRONTEND_URL || 'https://japaika.com',
  USER_BACKEND_URL: process.env.USER_BACKEND_URL || 'https://backend.japaika.com',
  CLOUDINARY_ROOT: 'japaika'
};
