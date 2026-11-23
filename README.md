# ERP_BACKEND

Internal Enterprise Resource Planning (ERP) & User Management Backend API for **Talkism Private Limited**, Ernakulam, Kochi.

Built with **Node.js**, **Express.js**, **MongoDB (Mongoose)**, **Nodemailer**, and **JWT**.

## Key Capabilities

- **Super Admin Governance**: Complete CRUD for employee accounts, invitation dispatches, account activation/deactivation, and blocking/unblocking.
- **Invitation Flow Security**: Cryptographic email-ownership binding (`sha256`) and immediate single-use token invalidation.
- **Session Revocation**: OWASP-aligned `tokenVersion` session invalidation across logouts, password changes, and account status updates.
- **Audit Logging**: Comprehensive activity stream recording employee lifecycle actions with protected IP attribution and automatic write retry.
- **Security Hardened**: Helmet headers, express-rate-limit, CORS policy, zero plaintext credentials in logs or API responses, and strict RBAC middleware.

## Installation & Setup

```bash
# Install dependencies
npm install

# Copy example environment configuration
cp .env.example .env

# Start server in development mode
npm run dev

# Run automated end-to-end API verification suite
npm test
```

## Environment Variables

Configure the following in `.env` (refer to `.env.example`):
- `PORT`: Server listen port (default `5000`)
- `MONGODB_URI`: MongoDB connection string
- `JWT_SECRET`: Secret key for JWT signing
- `JWT_EXPIRES_IN`: JWT expiration (e.g. `7d`)
- `CLIENT_URL`: URL of the frontend application (default `http://localhost:5173`)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`: SMTP configuration for real mail delivery
- `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`: Credentials for the initial Super Admin provisioning
- `TRUST_PROXY`: Set to `true` when operating behind a reverse proxy (e.g. Render, Nginx)
