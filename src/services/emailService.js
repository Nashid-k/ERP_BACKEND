import nodemailer from 'nodemailer';

class EmailService {
  constructor() {
    this.transporter = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      const sanitizedPass = process.env.SMTP_PASS.replace(/\s+/g, '');
      const isGmail = process.env.SMTP_USER.includes('@gmail.com') || process.env.SMTP_HOST?.includes('gmail');

      if (isGmail) {
        this.transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.SMTP_USER.trim(),
            pass: sanitizedPass
          }
        });
        console.log('[EmailService] Configured with Gmail SMTP service for:', process.env.SMTP_USER);
      } else {
        this.transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: parseInt(process.env.SMTP_PORT || '465', 10),
          secure: process.env.SMTP_PORT === '465',
          auth: {
            user: process.env.SMTP_USER.trim(),
            pass: sanitizedPass
          }
        });
        console.log('[EmailService] Configured with custom SMTP server:', process.env.SMTP_HOST);
      }
    } else {
      // In dev mode without SMTP, create an ethereal test account or fallback to console simulation
      try {
        const testAccount = await nodemailer.createTestAccount();
        this.transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass
          }
        });
        console.log('[EmailService] Configured with Ethereal test account:', testAccount.user);
      } catch (err) {
        console.warn('[EmailService] Running in Console Simulation mode:', err.message);
        this.transporter = null;
      }
    }
    this.initialized = true;
  }

  async sendMail({ to, subject, html, text }) {
    await this.init();

    const from = process.env.SMTP_FROM || 'ERP System <no-reply@erp-system.local>';

    if (!this.transporter) {
      console.log(`[EmailService Delivery]: Dispatched "${subject}" to ${to} (Simulated / Development mode - Secrets suppressed).`);
      return { success: true, simulated: true };
    }

    try {
      const info = await this.transporter.sendMail({
        from,
        to,
        subject,
        text,
        html
      });

      console.log(`[EmailService Delivery]: Dispatched message ${info.messageId} to ${to}`);
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        console.log(`[EmailService]: Ethereal Preview URL: ${previewUrl}`);
      }

      return { success: true, messageId: info.messageId, previewUrl };
    } catch (error) {
      console.error('[EmailService Delivery Error]:', error.message);
      // Fallback log without body
      console.log(`[EmailService Fallback]: To: ${to} | Subject: ${subject}`);
      return { success: false, error: error.message };
    }
  }

  // 1. Send Invitation Email
  async sendInvitationEmail({ user, rawToken }) {
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const invitationUrl = `${clientUrl}/accept-invitation?token=${rawToken}&email=${encodeURIComponent(user.email)}`;

    const subject = 'Welcome to Talkism Private Limited – Your Staff ERP Account';
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 620px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
        <div style="text-align: center; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 2px solid #f1f5f9;">
          <div style="display: inline-block; background: linear-gradient(135deg, #1e3a8a, #3b82f6); color: #ffffff; font-size: 20px; font-weight: 800; padding: 10px 18px; border-radius: 12px; letter-spacing: 0.5px; margin-bottom: 8px;">
            TALKISM
          </div>
          <h1 style="color: #0f172a; font-size: 20px; font-weight: 700; margin: 4px 0 0 0;">Talkism Private Limited</h1>
          <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">Internal ERP & Enterprise User Portal • Ernakulam, Kochi</p>
        </div>
        
        <p style="color: #334155; font-size: 15px; line-height: 1.6;">Dear <strong>${user.name}</strong>,</p>
        
        <p style="color: #334155; font-size: 14px; line-height: 1.6;">
          Welcome to the <strong>Talkism Private Limited</strong> team. An internal staff account has been provisioned for you in our enterprise system with the role of <strong>${user.role === 'SUPER_ADMIN' ? 'Super Administrator' : 'Staff User'}</strong> within the <strong>${user.department || 'General'}</strong> department.
        </p>
        
        <p style="color: #334155; font-size: 14px; line-height: 1.6;">
          To complete your onboarding and activate your authorized access, please verify your email and set your confidential password:
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${invitationUrl}" style="background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #ffffff; padding: 13px 32px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 10px; display: inline-block; box-shadow: 0 4px 10px rgba(37, 99, 235, 0.25);">
            Activate Talkism Account
          </a>
        </div>
        
        <p style="color: #64748b; font-size: 12px; line-height: 1.5;">
          Direct Activation Link:<br/>
          <a href="${invitationUrl}" style="color: #2563eb; word-break: break-all;">${invitationUrl}</a>
        </p>
        
        <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #f1f5f9; font-size: 11px; color: #94a3b8; line-height: 1.5;">
          <p style="margin: 0; font-weight: 600; color: #64748b;">Security Information:</p>
          <p style="margin: 2px 0 0 0;">This invitation is strictly personal, single-use, and valid for 48 hours. Never share this activation link with anyone.</p>
          <div style="margin-top: 14px; padding-top: 10px; border-top: 1px dashed #e2e8f0; color: #94a3b8; text-align: center;">
            <strong>Talkism Private Limited</strong><br/>
            KC Arcade, Near TV Centre, CSEZ, Ernakulam, Kochi, Kerala - 682037<br/>
            CIN: U62013KL2025PTC091645
          </div>
        </div>
      </div>
    `;

    const text = `Dear ${user.name},\n\nWelcome to Talkism Private Limited.\nAn internal staff account has been provisioned for you (${user.role} - ${user.department || 'General'}).\nPlease activate your account and establish your password here:\n${invitationUrl}\n\nTalkism Private Limited, Ernakulam, Kochi, Kerala - 682037.`;

    console.log(`[EmailService]: Staff invitation dispatched to ${user.email} (Token omitted from telemetry logs for security).`);

    return this.sendMail({ to: user.email, subject, html, text });
  }

  // 2. Send Password Reset Email
  async sendPasswordResetEmail({ user, rawToken }) {
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const resetUrl = `${clientUrl}/reset-password?token=${rawToken}&email=${encodeURIComponent(user.email)}`;

    const subject = 'Talkism Private Limited – Password Reset Request';
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 620px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
        <div style="text-align: center; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 2px solid #f1f5f9;">
          <div style="display: inline-block; background: linear-gradient(135deg, #1e3a8a, #3b82f6); color: #ffffff; font-size: 20px; font-weight: 800; padding: 10px 18px; border-radius: 12px; letter-spacing: 0.5px; margin-bottom: 8px;">
            TALKISM
          </div>
          <h1 style="color: #0f172a; font-size: 20px; font-weight: 700; margin: 4px 0 0 0;">Talkism Private Limited</h1>
          <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">Internal ERP & Enterprise User Portal • Ernakulam, Kochi</p>
        </div>
        
        <p style="color: #334155; font-size: 15px;">Dear <strong>${user.name}</strong>,</p>
        
        <p style="color: #334155; font-size: 14px; line-height: 1.6;">
          A password reset request was received for your Talkism ERP account. Click the button below to establish a new password:
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #0f172a; color: #ffffff; padding: 13px 32px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 10px; display: inline-block;">
            Reset Talkism Password
          </a>
        </div>
        
        <p style="color: #64748b; font-size: 12px; line-height: 1.5;">
          Direct Link: <a href="${resetUrl}" style="color: #2563eb; word-break: break-all;">${resetUrl}</a>
        </p>
        
        <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #f1f5f9; font-size: 11px; color: #94a3b8;">
          <p style="margin: 0;">This link is valid for 1 hour. If you did not request this, please notify your Super Admin at Talkism Ernakulam immediately.</p>
          <div style="margin-top: 14px; padding-top: 10px; border-top: 1px dashed #e2e8f0; color: #94a3b8; text-align: center;">
            Talkism Private Limited, Ernakulam, Kochi, Kerala - 682037
          </div>
        </div>
      </div>
    `;

    const text = `Hello ${user.name},\n\nPlease reset your password here:\n${resetUrl}\n\nExpires in 1 hour.`;

    console.log(`[EmailService]: Password reset dispatched to ${user.email} (Token omitted from telemetry logs for security).`);

    return this.sendMail({ to: user.email, subject, html, text });
  }
}

export default new EmailService();
