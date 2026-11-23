# Backend CI/CD

## Pipeline

GitHub Actions runs on pull requests targeting `main` and pushes to `main`.

1. Checks out the repository.
2. Installs the exact locked dependency tree with `npm ci`.
3. Validates JavaScript syntax for every backend source file and the API test runner.
4. After a successful CI run on `main`, triggers a Render deployment.

The workflow does not run `npm test`: the current `test-api.js` is a live-server integration script that assumes a locally running API and hard-coded Super Admin credentials. It is not yet isolated for CI and must not be pointed at production data. Convert it to an isolated test environment with disposable test credentials/database before making it a required CI gate.

## Render setup

1. Create/configure the backend Web Service in Render, connected to `Nashid-k/ERP_BACKEND`.
2. Set the service root directory to the repository root.
3. Set the build command to `npm ci` (or leave Render's install command as `npm install` only if deliberately configured).
4. Set the start command to `npm start`.
5. Configure all runtime environment variables in Render's Environment settings. At minimum: `NODE_ENV=production`, `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CLIENT_URL`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, and the required SMTP variables. Configure `TRUST_PROXY=true` only when the deployment is behind a trusted proxy.
6. Add a health check path of `/api/health`.
7. Create a Render Deploy Hook and save its URL as the GitHub Actions repository secret `RENDER_DEPLOY_HOOK`.
8. Disable Render's automatic deploy-on-push if using this workflow to trigger deployments, to avoid duplicate deployments.

The deploy job is intentionally skipped until `RENDER_DEPLOY_HOOK` is configured. Runtime secrets belong in Render, not in Git or workflow files.

## Test strategy limitation

The current API test script expects an already-running server on port 5000 and uses fixed credentials. It also creates and mutates user records. Do not run it against production. The next quality gate should be a dedicated test mode using an isolated MongoDB database and test-only credentials, followed by `npm test` in CI.
