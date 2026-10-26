import multer from 'multer';
import { AppError } from '../utils/appError.js';

/**
 * Whitelist of allowed MIME types for media and documents.
 */
const ALLOWED_MIME_TYPES = [
  // Images
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  // Documents
  'application/pdf'
];

/**
 * In-memory storage streams files directly to Cloudinary without local disk footprint.
 */
const storage = multer.memoryStorage();

/**
 * File filter to validate MIME types.
 */
const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new AppError(
        `Unsupported file type "${file.mimetype}". Allowed types: JPEG, PNG, WebP, GIF, SVG, PDF.`,
        400
      ),
      false
    );
  }
};

const multerInstance = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 MB per file limit
  },
  fileFilter
});

/**
 * Express middleware for single file upload.
 *
 * @param {string} fieldName - Form field name (default: 'file')
 */
export const uploadSingle = (fieldName = 'file') => {
  const handler = multerInstance.single(fieldName);

  return (req, res, next) => {
    handler(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new AppError('File size exceeds the allowed limit of 10MB.', 400));
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return next(
            new AppError(`Unexpected form field "${err.field}". Please attach your file under field "${fieldName}".`, 400)
          );
        }
        return next(new AppError(`File upload error: ${err.message}`, 400));
      } else if (err) {
        return next(err);
      }
      next();
    });
  };
};

/**
 * Express middleware for multiple files upload.
 *
 * @param {string} fieldName - Form field name (default: 'files')
 * @param {number} maxCount - Max number of allowed files (default: 5)
 */
export const uploadMultiple = (fieldName = 'files', maxCount = 5) => {
  const handler = multerInstance.array(fieldName, maxCount);

  return (req, res, next) => {
    handler(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new AppError('One or more files exceed the allowed limit of 10MB.', 400));
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return next(
            new AppError(`Cannot upload more than ${maxCount} files at once under field "${fieldName}".`, 400)
          );
        }
        return next(new AppError(`File upload error: ${err.message}`, 400));
      } else if (err) {
        return next(err);
      }
      next();
    });
  };
};
