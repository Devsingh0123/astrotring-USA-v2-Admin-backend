import { cloudinary, isCloudinaryConfigured } from '../config/cloudinary.js';
import { AppError } from '../utils/appError.js';

/**
 * Helper to safely extract Cloudinary public_id from a full URL or raw ID.
 * Example URL: https://res.cloudinary.com/demo/image/upload/v1729930000/japaika/blogs/saturn.png
 * Extracted ID: japaika/blogs/saturn
 */
export const extractPublicId = (publicIdOrUrl) => {
  if (!publicIdOrUrl || typeof publicIdOrUrl !== 'string') return '';
  const trimmed = publicIdOrUrl.trim();

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const match = trimmed.match(/\/upload\/(?:v\d+\/)?([^\.]+)/);
    if (match && match[1]) {
      return match[1];
    }
  }

  // Strip extension if present at the end of a public ID
  return trimmed.replace(/\.[a-zA-Z0-9]+$/, '');
};

/**
 * Uploads a file buffer or base64/URL string directly to Cloudinary.
 *
 * @param {Buffer|string} fileInput - In-memory Buffer, base64 data URI, or remote image URL
 * @param {Object} options - Upload options (folder, resource_type, public_id, transformation, etc.)
 * @returns {Promise<Object>} Formatted Cloudinary asset details
 */
export const uploadToCloudinary = (fileInput, options = {}) => {
  if (!isCloudinaryConfigured()) {
    throw new AppError(
      'Cloudinary credentials are not configured on the server. Please set valid CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in your .env file.',
      503
    );
  }

  const uploadOptions = {
    folder: options.folder || 'japaika/blogs',
    resource_type: options.resource_type || 'auto',
    ...(options.public_id && { public_id: options.public_id }),
    ...(options.transformation && { transformation: options.transformation })
  };

  // If input is a base64 string or remote URL
  if (typeof fileInput === 'string') {
    return cloudinary.uploader.upload(fileInput, uploadOptions)
      .then((result) => ({
        url: result.url,
        secure_url: result.secure_url,
        public_id: result.public_id,
        format: result.format,
        resource_type: result.resource_type,
        bytes: result.bytes,
        width: result.width || null,
        height: result.height || null,
        created_at: result.created_at
      }))
      .catch((error) => {
        throw new AppError(`Cloudinary upload failed: ${error.message}`, 502);
      });
  }

  // If input is an in-memory buffer from multer
  if (Buffer.isBuffer(fileInput)) {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) {
            return reject(new AppError(`Cloudinary upload failed: ${error.message}`, 502));
          }

          resolve({
            url: result.url,
            secure_url: result.secure_url,
            public_id: result.public_id,
            format: result.format,
            resource_type: result.resource_type,
            bytes: result.bytes,
            width: result.width || null,
            height: result.height || null,
            created_at: result.created_at
          });
        }
      );

      // Directly write buffer and end stream — zero manual stream wrapping boilerplate
      uploadStream.end(fileInput);
    });
  }

  throw new AppError('Invalid file input. Expected a file Buffer or URL/base64 string.', 400);
};

/**
 * Deletes a file from Cloudinary by its public ID or full URL.
 *
 * @param {string} publicIdOrUrl - Cloudinary public_id or full asset URL
 * @param {string} resourceType - Resource type ('image', 'raw', 'video')
 * @returns {Promise<Object>} Deletion result
 */
export const deleteFromCloudinary = async (publicIdOrUrl, resourceType = 'image') => {
  if (!isCloudinaryConfigured()) {
    throw new AppError(
      'Cloudinary credentials are not configured on the server. Please set valid CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in your .env file.',
      503
    );
  }

  const cleanPublicId = extractPublicId(publicIdOrUrl);
  if (!cleanPublicId) {
    throw new AppError('A valid Cloudinary public_id or URL is required for deletion.', 400);
  }

  try {
    const result = await cloudinary.uploader.destroy(cleanPublicId, {
      resource_type: resourceType,
      invalidate: true
    });

    return {
      public_id: cleanPublicId,
      result: result.result || 'ok'
    };
  } catch (error) {
    throw new AppError(`Failed to delete asset from Cloudinary: ${error.message}`, 502);
  }
};
