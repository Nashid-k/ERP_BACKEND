import AuditLog from '../models/AuditLog.js';

// Durable write helper with automatic retry
const writeWithRetry = async (logData, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await AuditLog.create(logData);
      return true;
    } catch (err) {
      if (attempt === maxRetries) {
        // High-severity alert for audit persistence failure
        console.error(
          `[CRITICAL AUDIT PERSISTENCE FAILURE]: Unable to persist audit log after ${maxRetries} attempts. Action: ${logData.action}, Target: ${logData.targetUserEmail}. Error: ${err.message}`
        );
        // Fallback structured durability record
        console.error('[AUDIT_DURABLE_FALLBACK]:', JSON.stringify({
          timestamp: new Date().toISOString(),
          ...logData,
          writeError: err.message
        }));
        return false;
      }
      // Linear backoff
      await new Promise((r) => setTimeout(r, attempt * 100));
    }
  }
};

export const logActivity = async ({
  action,
  performedBy = null,
  targetUser = null,
  targetUserEmail = '',
  details = {},
  req = null
}) => {
  try {
    let ipAddress = '127.0.0.1';
    let userAgent = '';

    if (req) {
      // Trust X-Forwarded-For only if explicitly configured via TRUST_PROXY
      const isProxyTrusted = process.env.TRUST_PROXY === 'true';
      if (isProxyTrusted && req.headers['x-forwarded-for']) {
        ipAddress = req.headers['x-forwarded-for'].split(',')[0].trim();
      } else {
        // Direct socket connection address - cannot be spoofed by client request headers
        ipAddress = req.socket?.remoteAddress || req.connection?.remoteAddress || req.ip || '127.0.0.1';
      }
      userAgent = req.headers['user-agent'] || '';
    }

    const logData = {
      action,
      performedBy,
      targetUser,
      targetUserEmail,
      details,
      ipAddress,
      userAgent
    };

    await writeWithRetry(logData);
  } catch (error) {
    console.error('[Audit Service Error]:', error.message);
  }
};
