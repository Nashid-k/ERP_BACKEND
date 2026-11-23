import User from '../models/User.js';
import emailService from '../services/emailService.js';
import { logActivity } from '../services/auditService.js';
import validator from 'validator';

// 1. Create New User (Super Admin only)
export const createUser = async (req, res, next) => {
  try {
    const { name, email, role = 'USER', department = 'General', phone = '', bio = '' } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Name and email address are required.'
      });
    }

    if (!validator.isEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if email already exists
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      if (existingUser.isDeleted || existingUser.isBlocked || existingUser.status === 'BLOCKED') {
        return res.status(409).json({
          success: false,
          message: `An account with email "${normalizedEmail}" is currently in the Blocked Users list. You can unblock it from the Blocked Users tab instead of creating a duplicate.`,
          isBlocked: true,
          blockedUserId: existingUser._id
        });
      }

      return res.status(409).json({
        success: false,
        message: `A user with email "${normalizedEmail}" already exists in the system.`
      });
    }

    // Create new user object
    const newUser = new User({
      name: name.trim(),
      email: normalizedEmail,
      role: ['SUPER_ADMIN', 'USER'].includes(role) ? role : 'USER',
      department: department.trim(),
      phone: phone.trim(),
      bio: bio.trim(),
      status: 'INVITED',
      isEmailVerified: false,
      isDeleted: false,
      createdBy: req.user._id
    });

    // Generate invitation token
    const rawInvitationToken = newUser.generateInvitationToken();
    await newUser.save();

    // Dispatch invitation email asynchronously in background (non-blocking)
    emailService
      .sendInvitationEmail({
        user: newUser,
        rawToken: rawInvitationToken
      })
      .then((emailResult) => {
        logActivity({
          action: 'INVITATION_SENT',
          performedBy: req.user._id,
          targetUser: newUser._id,
          targetUserEmail: newUser.email,
          details: { emailDelivered: emailResult.success },
          req
        }).catch((err) => console.error('[Background Audit Error]:', err.message));
      })
      .catch((err) => console.error('[Background Email Dispatch Error]:', err.message));

    // Audit user creation asynchronously in background
    logActivity({
      action: 'USER_CREATED',
      performedBy: req.user._id,
      targetUser: newUser._id,
      targetUserEmail: newUser.email,
      details: {
        role: newUser.role,
        department: newUser.department,
        status: newUser.status
      },
      req
    }).catch((err) => console.error('[Background Audit Error]:', err.message));

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const invitationLink = `${clientUrl}/accept-invitation?token=${rawInvitationToken}`;

    return res.status(201).json({
      success: true,
      message: `User account created for ${newUser.email}. Invitation email dispatched successfully.`,
      user: newUser.toJSON(),
      invitationLink
    });
  } catch (error) {
    next(error);
  }
};

// 2. List Users with Search, Filters, and Pagination
export const listUsers = async (req, res, next) => {
  try {
    const {
      search = '',
      status = 'ALL',
      role = 'ALL',
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {};

    // Filter by blocked / soft-delete and status
    if (status === 'BLOCKED' || status === 'DELETED') {
      query.$or = [{ isDeleted: true }, { isBlocked: true }, { status: 'BLOCKED' }, { status: 'DELETED' }];
    } else if (status === 'ALL') {
      // By default "ALL" in active user view hides blocked/deleted accounts
      query.isDeleted = false;
      query.isBlocked = { $ne: true };
      query.status = { $nin: ['BLOCKED', 'DELETED'] };
    } else {
      query.isDeleted = false;
      query.isBlocked = { $ne: true };
      query.status = status;
    }

    // Role filter
    if (role !== 'ALL' && ['SUPER_ADMIN', 'USER'].includes(role)) {
      query.role = role;
    }

    // Search by name or email
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [{ name: searchRegex }, { email: searchRegex }, { department: searchRegex }];
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const sortOption = {};
    sortOption[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const [users, total] = await Promise.all([
      User.find(query)
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum)
        .populate('createdBy', 'name email')
        .populate('deletedBy', 'name email'),
      User.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      users,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    next(error);
  }
};

// 3. Get Overview Stats for User Management
export const getUserStats = async (req, res, next) => {
  try {
    const blockedQuery = { $or: [{ isDeleted: true }, { isBlocked: true }, { status: 'BLOCKED' }, { status: 'DELETED' }] };
    const unblockedQuery = { isDeleted: false, isBlocked: { $ne: true }, status: { $nin: ['BLOCKED', 'DELETED'] } };

    const [totalUsers, activeUsers, inactiveUsers, invitedUsers, blockedUsers, superAdmins] =
      await Promise.all([
        User.countDocuments(unblockedQuery),
        User.countDocuments({ ...unblockedQuery, status: 'ACTIVE' }),
        User.countDocuments({ ...unblockedQuery, status: 'INACTIVE' }),
        User.countDocuments({ ...unblockedQuery, status: 'INVITED' }),
        User.countDocuments(blockedQuery),
        User.countDocuments({ ...unblockedQuery, role: 'SUPER_ADMIN' })
      ]);

    return res.status(200).json({
      success: true,
      stats: {
        total: totalUsers,
        active: activeUsers,
        inactive: inactiveUsers,
        invited: invitedUsers,
        blocked: blockedUsers,
        deleted: blockedUsers,
        superAdmins
      }
    });
  } catch (error) {
    next(error);
  }
};

// 4. Get Individual User Details
export const getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .populate('createdBy', 'name email role')
      .populate('deletedBy', 'name email role');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    return res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    next(error);
  }
};

// 5. Update User Information
export const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, email, role, department, phone, bio } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    if (user.isDeleted) {
      return res.status(400).json({
        success: false,
        message: 'Cannot update a deleted user account. Please restore the account first.'
      });
    }

    const previousRole = user.role;

    // Check if attempting to demote the current Super Admin or the only Super Admin
    if (role && role !== user.role) {
      if (user.role === 'SUPER_ADMIN' && role === 'USER') {
        const totalSuperAdmins = await User.countDocuments({
          role: 'SUPER_ADMIN',
          isDeleted: false,
          status: 'ACTIVE'
        });

        if (totalSuperAdmins <= 1) {
          return res.status(400).json({
            success: false,
            message: 'Cannot demote the last remaining active Super Admin.'
          });
        }
      }
      user.role = role;
      if (role !== previousRole) {
        user.tokenVersion = (user.tokenVersion || 0) + 1;
      }
    }

    // Check email uniqueness if email is changed
    if (email && email.toLowerCase().trim() !== user.email) {
      const normalizedEmail = email.toLowerCase().trim();
      if (!validator.isEmail(normalizedEmail)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email address format.'
        });
      }

      const existing = await User.findOne({ email: normalizedEmail, _id: { $ne: id } });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: 'Another user account already exists with this email address.'
        });
      }

      user.email = normalizedEmail;
    }

    if (name) user.name = name.trim();
    if (department !== undefined) user.department = department.trim();
    if (phone !== undefined) user.phone = phone.trim();
    if (bio !== undefined) user.bio = bio.trim();

    await user.save();

    await logActivity({
      action: 'USER_UPDATED',
      performedBy: req.user._id,
      targetUser: user._id,
      targetUserEmail: user.email,
      details: {
        updatedFields: { name, email, role, department, phone, bio },
        previousRole
      },
      req
    });

    return res.status(200).json({
      success: true,
      message: 'User account updated successfully.',
      user: user.toJSON()
    });
  } catch (error) {
    next(error);
  }
};

// 6. Activate or Deactivate User Account
export const updateUserStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['ACTIVE', 'INACTIVE'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be set to either ACTIVE or INACTIVE.'
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    if (user.isDeleted) {
      return res.status(400).json({
        success: false,
        message: 'Account is currently soft-deleted. Use the Restore action first.'
      });
    }

    // Prevent user from deactivating themselves
    if (user._id.toString() === req.user._id.toString() && status === 'INACTIVE') {
      return res.status(400).json({
        success: false,
        message: 'You cannot deactivate your own Super Admin account.'
      });
    }

    const oldStatus = user.status;
    user.status = status;
    if (status === 'INACTIVE') {
      user.tokenVersion = (user.tokenVersion || 0) + 1;
    }
    await user.save();

    await logActivity({
      action: 'USER_STATUS_CHANGED',
      performedBy: req.user._id,
      targetUser: user._id,
      targetUserEmail: user.email,
      details: { oldStatus, newStatus: status },
      req
    });

    return res.status(200).json({
      success: true,
      message: `User status changed to ${status}.`,
      user: user.toJSON()
    });
  } catch (error) {
    next(error);
  }
};

// 7. Block / Soft-Delete User
export const blockUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    // Cannot block oneself
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot block your own Super Admin account.'
      });
    }

    // If already blocked
    if (user.isBlocked || user.isDeleted || user.status === 'BLOCKED') {
      return res.status(400).json({
        success: false,
        message: 'This user account is already blocked.'
      });
    }

    // Protect against blocking the only active Super Admin
    if (user.role === 'SUPER_ADMIN') {
      const activeSuperAdmins = await User.countDocuments({
        role: 'SUPER_ADMIN',
        isDeleted: false,
        isBlocked: { $ne: true },
        status: 'ACTIVE'
      });
      if (activeSuperAdmins <= 1) {
        return res.status(400).json({
          success: false,
          message: 'Cannot block the only remaining active Super Admin.'
        });
      }
    }

    // Set blocked and soft-deleted flags
    user.isBlocked = true;
    user.isDeleted = true;
    user.status = 'BLOCKED';
    user.blockedAt = new Date();
    user.blockedBy = req.user._id;
    user.deletedAt = new Date();
    user.deletedBy = req.user._id;
    // Invalidate any active sessions and outstanding invitation tokens immediately
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.invitationToken = undefined;
    user.invitationExpiresAt = undefined;

    await user.save();

    await User.updateOne(
      { _id: user._id },
      { $unset: { invitationToken: 1, invitationExpiresAt: 1 } }
    );

    await logActivity({
      action: 'USER_BLOCKED',
      performedBy: req.user._id,
      targetUser: user._id,
      targetUserEmail: user.email,
      details: { blocked: true },
      req
    });

    return res.status(200).json({
      success: true,
      message: `User ${user.email} has been blocked successfully. They can no longer log in.`,
      user: user.toJSON()
    });
  } catch (error) {
    next(error);
  }
};
export const softDeleteUser = blockUser;

// 8. Unblock / Restore User
export const unblockUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    if (!user.isBlocked && !user.isDeleted && user.status !== 'BLOCKED' && user.status !== 'DELETED') {
      return res.status(400).json({
        success: false,
        message: 'This user account is not blocked.'
      });
    }

    user.isBlocked = false;
    user.isDeleted = false;
    user.blockedAt = null;
    user.blockedBy = null;
    user.deletedAt = null;
    user.deletedBy = null;
    user.status = user.isEmailVerified ? 'ACTIVE' : 'INVITED';

    await user.save();

    await logActivity({
      action: 'USER_UNBLOCKED',
      performedBy: req.user._id,
      targetUser: user._id,
      targetUserEmail: user.email,
      details: { restoredStatus: user.status },
      req
    });

    return res.status(200).json({
      success: true,
      message: `User account ${user.email} has been successfully unblocked.`,
      user: user.toJSON()
    });
  } catch (error) {
    next(error);
  }
};
export const restoreUser = unblockUser;

// 9. Resend Invitation Email for pending users
export const resendInvitation = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    if (user.isDeleted) {
      return res.status(400).json({
        success: false,
        message: 'Cannot send invitation to a deleted user.'
      });
    }

    if (user.isEmailVerified && user.status === 'ACTIVE') {
      return res.status(400).json({
        success: false,
        message: 'This user has already accepted their invitation and activated their account.'
      });
    }

    const rawToken = user.generateInvitationToken();
    user.status = 'INVITED';
    await user.save();

    // Non-blocking background email dispatch
    emailService
      .sendInvitationEmail({
        user,
        rawToken
      })
      .catch((err) => console.error('[Background Resend Email Error]:', err.message));

    logActivity({
      action: 'INVITATION_RESENT',
      performedBy: req.user._id,
      targetUser: user._id,
      targetUserEmail: user.email,
      req
    }).catch((err) => console.error('[Background Audit Error]:', err.message));

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const invitationLink = `${clientUrl}/accept-invitation?token=${rawToken}`;

    return res.status(200).json({
      success: true,
      message: `Invitation email resent to ${user.email}.`,
      invitationLink
    });
  } catch (error) {
    next(error);
  }
};
