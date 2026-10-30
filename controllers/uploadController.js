import { uploadToCloudinary, deleteFromCloudinary } from '../services/cloudinaryService.js';
import { AppError } from '../utils/appError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Reusable helper to clean and scope the Cloudinary destination folder.
 */
const sanitizeFolder = (folderInput, defaultFolder = 'japaika/blogs') => {
  if (!folderInput || typeof folderInput !== 'string') {
    return defaultFolder;
  }
  const clean = folderInput.trim().replace(/[^a-zA-Z0-9_\-\/]/g, '');
  if (!clean) return defaultFolder;
  return clean.startsWith('japaika/') ? clean : `japaika/${clean}`;
};

/**
 * POST /api/v1/admin/uploads
 * Uploads a single media or document file to Cloudinary.
 */
export const uploadFile = asyncHandler(async (req, res, next) => {
  if (!req.file) {
    return next(new AppError('No file provided. Please attach a file under the "file" form field.', 400));
  }

  const folder = sanitizeFolder(req.body?.folder, 'japaika/blogs');

  const result = await uploadToCloudinary(req.file.buffer, {
    folder,
    resource_type: 'auto'
  });

  res.status(201).json({
    success: true,
    message: 'File uploaded successfully',
    data: {
      file: {
        original_name: req.file.originalname,
        mime_type: req.file.mimetype,
        ...result
      }
    }
  });
});

/**
 * POST /api/v1/admin/uploads/bulk
 * Uploads multiple media or document files to Cloudinary in parallel.
 */
export const uploadMultipleFiles = asyncHandler(async (req, res, next) => {
  if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
    return next(new AppError('No files provided. Please attach files under the "files" form field.', 400));
  }

  const folder = sanitizeFolder(req.body?.folder, 'japaika/media');

  const uploadedFiles = await Promise.all(
    req.files.map(async (file) => {
      const result = await uploadToCloudinary(file.buffer, {
        folder,
        resource_type: 'auto'
      });
      return {
        original_name: file.originalname,
        mime_type: file.mimetype,
        ...result
      };
    })
  );

  res.status(201).json({
    success: true,
    message: `${uploadedFiles.length} file(s) uploaded successfully`,
    data: {
      files: uploadedFiles
    }
  });
});

/**
 * DELETE /api/v1/admin/uploads
 * Removes an uploaded asset from Cloudinary by its public ID or full URL.
 */
export const deleteFile = asyncHandler(async (req, res, next) => {
  const target = req.body?.public_id || req.body?.url || req.query?.public_id || req.query?.url;
  const resourceType = req.body?.resource_type || req.query?.resource_type || 'image';

  if (!target || typeof target !== 'string' || !target.trim()) {
    return next(new AppError('A valid "public_id" or "url" is required to delete an asset.', 400));
  }

  const deletionResult = await deleteFromCloudinary(target.trim(), resourceType);

  res.status(200).json({
    success: true,
    message: 'Asset deleted from Cloudinary successfully',
    data: deletionResult
  });
});
