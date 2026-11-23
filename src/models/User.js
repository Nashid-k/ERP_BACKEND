import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a name'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters']
    },
    email: {
      type: String,
      required: [true, 'Please provide an email address'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [
        /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        'Please provide a valid email address'
      ],
      index: true
    },
    password: {
      type: String,
      minlength: [8, 'Password must be at least 8 characters long'],
      select: false // Not selected by default in queries
    },
    role: {
      type: String,
      enum: {
        values: ['SUPER_ADMIN', 'USER'],
        message: '{VALUE} is not a valid role'
      },
      default: 'USER',
      index: true
    },
    status: {
      type: String,
      enum: {
        values: ['INVITED', 'ACTIVE', 'INACTIVE', 'DELETED', 'BLOCKED'],
        message: '{VALUE} is not a valid account status'
      },
      default: 'INVITED',
      index: true
    },
    isEmailVerified: {
      type: Boolean,
      default: false
    },
    isBlocked: {
      type: Boolean,
      default: false,
      index: true
    },
    blockedAt: {
      type: Date,
      default: null
    },
    blockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    },
    deletedAt: {
      type: Date,
      default: null
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    invitationToken: {
      type: String,
      select: false
    },
    invitationExpiresAt: {
      type: Date,
      select: false
    },
    resetPasswordToken: {
      type: String,
      select: false
    },
    resetPasswordExpiresAt: {
      type: Date,
      select: false
    },
    department: {
      type: String,
      trim: true,
      default: 'General'
    },
    phone: {
      type: String,
      trim: true,
      default: ''
    },
    bio: {
      type: String,
      trim: true,
      maxlength: [500, 'Bio cannot exceed 500 characters'],
      default: ''
    },
    lastLoginAt: {
      type: Date,
      default: null
    },
    tokenVersion: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

// Hash password before saving if modified
userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});


// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

// Generate invitation token
userSchema.methods.generateInvitationToken = function () {
  // Generate random bytes
  const rawToken = crypto.randomBytes(32).toString('hex');
  
  // Store hashed version in DB
  this.invitationToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  // Expires in 48 hours
  this.invitationExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

  return rawToken;
};

// Generate password reset token
userSchema.methods.generateResetPasswordToken = function () {
  const rawToken = crypto.randomBytes(32).toString('hex');
  
  this.resetPasswordToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  // Expires in 1 hour
  this.resetPasswordExpiresAt = new Date(Date.now() + 60 * 60 * 1000);

  return rawToken;
};

// Transform output JSON
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.invitationToken;
  delete obj.invitationExpiresAt;
  delete obj.resetPasswordToken;
  delete obj.resetPasswordExpiresAt;
  delete obj.__v;
  return obj;
};

const User = mongoose.model('User', userSchema);
export default User;
