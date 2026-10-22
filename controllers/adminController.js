/**
 * Admin Controller Skeleton
 */
export const getAdminStatus = async (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Admin Backend API operational',
    data: {
      admin: {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role
      }
    }
  });
};
