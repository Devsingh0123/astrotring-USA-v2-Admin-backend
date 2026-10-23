import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();

const app = express();

// Security HTTP headers
app.use(helmet());

// CORS configuration - allow admin frontend origin
const allowedOrigins = [
  process.env.ADMIN_FRONTEND_URL || 'http://localhost:5174',
  'http://localhost:5173'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g., mobile apps, curl, postman)
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true
}));

// Body parsers
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'admin-backend',
    port: process.env.PORT || 5001,
    timestamp: new Date().toISOString()
  });
});

// Admin API Routes Mounting
app.use('/api/v1/admin/auth', authRoutes);
app.use('/api/v1/admin/users', userRoutes);
app.use('/api/v1/admin', adminRoutes);

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
    console.log(`Admin Backend running in ${process.env.NODE_ENV || 'development'} mode on port ${port}`);
  });
};

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('server.js')) {
  startServer();
}

export default app;
