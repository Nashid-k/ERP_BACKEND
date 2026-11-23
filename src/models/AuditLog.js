import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      enum: [
        'USER_LOGIN',
        'USER_LOGOUT',
        'LOGIN_FAILED',
        'USER_CREATED',
        'USER_UPDATED',
        'USER_STATUS_CHANGED',
        'USER_DELETED',
        'USER_RESTORED',
        'USER_BLOCKED',
        'USER_UNBLOCKED',
        'INVITATION_SENT',
        'INVITATION_RESENT',
        'INVITATION_ACCEPTED',
        'EMAIL_VERIFIED',
        'PASSWORD_CHANGED',
        'PASSWORD_RESET_REQUESTED',
        'PASSWORD_RESET_COMPLETED',
        'PROFILE_UPDATED',
        'SECURITY_ALERT_EMAIL_MISMATCH'
      ],
      index: true
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    targetUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    targetUserEmail: {
      type: String,
      default: ''
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    ipAddress: {
      type: String,
      default: ''
    },
    userAgent: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }
  }
);

const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
