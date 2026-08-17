import express from 'express';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import cors from 'cors';
import morgan from 'morgan';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import productRoutes from './routes/productRoutes.js';
import cartRoutes from './routes/cartRoutes.js';
import wishlistRoutes from './routes/wishlistRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import couponRoutes from './routes/couponRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import Product from './models/Product.js';
import { seedDemoData } from './data/seed.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const uploadsPath = path.join(rootDir, 'server', 'public');
const clientDistPath = path.join(rootDir, 'client', 'dist');
const hasClientBuild = fs.existsSync(path.join(clientDistPath, 'index.html'));
const frontendRootUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:5173';

const app = express();
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5175',
  'http://localhost:5176',
  'http://127.0.0.1:5176',
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL,
].filter(Boolean);

const localOriginRegex = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/;

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || localOriginRegex.test(origin)) {
        return callback(null, true);
      }
      callback(new Error('CORS policy does not allow access from the specified origin'));
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(morgan('dev'));

// Serve uploaded/static files (product photos) from server/public at /uploads
app.use('/uploads', express.static(uploadsPath));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'gavyadhenu-api' }));

app.get('/', (req, res) => {
  if (hasClientBuild) {
    return res.sendFile(path.join(clientDistPath, 'index.html'));
  }

  if (req.accepts('html')) {
    return res.redirect(frontendRootUrl);
  }

  return res.json({ message: 'Gavyadhenu API is running' });
});

// Middleware to return 503 when DB is not ready for API routes
app.use((req, res, next) => {
  if (mongoose.connection.readyState !== 1 && req.path.startsWith('/api')) {
    return res.status(503).json({ message: 'Service temporarily unavailable - database connecting' });
  }
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payment', paymentRoutes);

if (hasClientBuild) {
  app.use(express.static(clientDistPath));
  app.get(/^(?!\/api|\/uploads|\/health).*/, (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/health')) {
      return next();
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 5000;

// Handle uncaught exceptions and rejections
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const startServer = async () => {
  // Wait for DB connection BEFORE starting the server
  // This ensures the server only accepts requests after DB is ready
  try {
    await connectDB();
    console.log('✓ Database connection established. Starting server...');

    const productCount = await Product.countDocuments();
    if (productCount === 0) {
      console.log('ℹ️ No products found in database. Seeding demo catalog...');
      await seedDemoData();
    }
  } catch (error) {
    console.error('✗ Failed to connect to database on startup:', error.message);
    console.warn('⚠️ Server starting without database. Configure MONGO_URI to enable features.');
  }

  // Now listen for requests after DB is ready
  app.listen(PORT, () => {
    const serverUrl = process.env.SERVER_URL || `http://localhost:${PORT}`;
    console.log(`✓ Gavyadhenu server running on port ${PORT}`);
    console.log(`✓ API available at ${serverUrl}/api`);
    console.log(`✓ NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
  });
};

startServer();
