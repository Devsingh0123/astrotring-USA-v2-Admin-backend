import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import { BRAND } from './config/brand.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import couponRoutes from './routes/couponRoutes.js';
import questionPackRoutes from './routes/questionPackRoutes.js';
import reportPackRoutes from './routes/reportPackRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import blogRoutes from './routes/blogRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import adminManageRoutes from './routes/adminManageRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();

const app = express();

// Security HTTP headers
app.use(helmet());

// CORS configuration - allow Japaika admin frontend & local dev origins
const envOrigins = (process.env.ADMIN_FRONTEND_URL || '')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const allowedOrigins = Array.from(
  new Set([
    ...envOrigins,
    'https://admin.japaika.com',
    'http://localhost:5174',
    'http://localhost:5173'
  ])
);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g., mobile apps, curl, postman)
    const normalizedOrigin = origin?.replace(/\/+$/, '');
    if (!normalizedOrigin || allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  exposedHeaders: ['Content-Disposition']
}));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: BRAND.SERVICE_NAME,
    brand: BRAND.NAME,
    port: process.env.PORT || 5001,
    timestamp: new Date().toISOString()
  });
});

// Admin API Routes Mounting
app.use('/api/v1/admin/auth', authRoutes);
app.use('/api/v1/admin/users', userRoutes);
app.use('/api/v1/admin/orders', orderRoutes);
app.use('/api/v1/admin/coupons', couponRoutes);
app.use('/api/v1/admin/question-packs', questionPackRoutes);
app.use('/api/v1/admin/report-packs', reportPackRoutes);
app.use('/api/v1/admin/dashboard', dashboardRoutes);
app.use('/api/v1/admin/blogs', blogRoutes);
app.use('/api/v1/admin/uploads', uploadRoutes);
app.use('/api/v1/admin/chats', chatRoutes);
app.use('/api/v1/admin/admins', adminManageRoutes);

// Unhandled Route Handler
app.all('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Can't find ${req.originalUrl} on this server.`
  });
});

// Centralized Error Handling Middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5001;

export const startServer = async (port = PORT) => {
  await connectDB();
  return app.listen(port, () => {
    console.log(`${BRAND.NAME} Admin Backend running in ${process.env.NODE_ENV || 'development'} mode on port ${port}`);
  });
};

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('server.js')) {
  startServer();
}

export default app;
