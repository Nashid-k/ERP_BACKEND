import rateLimit from 'express-rate-limit';

// Auth endpoints rate limiter (15 minutes, max 30 requests; relaxed in development/test)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 50,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'test',
  message: {
    success: false,
    message: 'Too many login or activation attempts from this IP. Please try again after 15 minutes.'
  }
});

// Stricter limiter for password reset (15 minutes, max 5 requests)
export const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 100 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'test',
  message: {
    success: false,
    message: 'Too many password reset requests. Please wait 15 minutes before trying again.'
  }
});
