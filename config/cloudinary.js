import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Configure Cloudinary SDK.
 * Supports either:
 * 1. CLOUDINARY_URL (e.g. cloudinary://api_key:api_secret@cloud_name)
 * 2. Individual CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 */
if (process.env.CLOUDINARY_URL) {
  cloudinary.config({
    secure: true
  });
} else {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
    api_key: process.env.CLOUDINARY_API_KEY || '',
    api_secret: process.env.CLOUDINARY_API_SECRET || '',
    secure: true
  });
}

/**
 * Checks whether Cloudinary has valid environment configuration.
 * Returns false if keys are missing or still set to initial placeholder values.
 */
export const isCloudinaryConfigured = () => {
  if (process.env.CLOUDINARY_URL && !process.env.CLOUDINARY_URL.includes('your_api_key')) {
    return true;
  }

  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  return Boolean(
    CLOUDINARY_CLOUD_NAME &&
    CLOUDINARY_API_KEY &&
    CLOUDINARY_API_SECRET &&
    !CLOUDINARY_CLOUD_NAME.includes('your_cloudinary') &&
    !CLOUDINARY_API_KEY.includes('your_cloudinary') &&
    !CLOUDINARY_API_SECRET.includes('your_cloudinary')
  );
};

export { cloudinary };
export default cloudinary;
