// Simple automated verification script against live server
const runTests = async () => {
  // Wait 1 second for DB connection and seed in server.js
  await new Promise((r) => setTimeout(r, 1200));

  const BASE_URL = 'http://localhost:5000';

  const request = async (path, options = {}) => {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data };
  };

  let testFailures = 0;
  const assert = (condition, testName, details = '') => {
    if (condition) {
      console.log(`PASS: ${testName}`);
    } else {
      console.error(`FAIL: ${testName} - ${details}`);
      testFailures++;
    }
  };

  console.log('\n--- STARTING AUTOMATED BACKEND VERIFICATION ---\n');

  // Test 1: Health Check
  const health = await request('/api/health');
  assert(health.status === 200 && health.data.status === 'online', 'Health Check API returns online');

  // Test 2: Public Registration Does Not Exist
  const publicRegister = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: 'hacker@erp.com', password: 'Password123!' })
  });
  assert(publicRegister.status === 404, 'Public registration is disabled / returns 404');

  // Test 3: Super Admin Login
  const adminLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'superadmin@erp.com', password: 'SuperAdmin@2026!' })
  });
  assert(adminLogin.status === 200 && !!adminLogin.data.token, 'Super Admin login succeeds with token');
  const adminToken = adminLogin.data.token;

  // Test 4: Super Admin Creates New User
  const testUserEmail = `employee_${Date.now()}@erp.com`;
  const createUserRes = await request('/api/admin/users', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      name: 'Alice Employee',
      email: testUserEmail,
      role: 'USER',
      department: 'Finance'
    })
  });
  assert(createUserRes.status === 201 && createUserRes.data.user.status === 'INVITED', 'Super Admin creates invited user');
  const createdUserId = createUserRes.data.user._id;
  const invitationLink = createUserRes.data.invitationLink;
  const invitationToken = new URL(invitationLink).searchParams.get('token');

  // Test 5: Invited User Cannot Log In Before Activation
  const unactivatedLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: testUserEmail, password: 'AnyPassword123!' })
  });
  assert(unactivatedLogin.status === 403, 'Unactivated invited user is blocked from logging in');

  // Test 6a: Accept Invitation Rejects Missing Email
  const noEmailAcceptRes = await request('/api/auth/accept-invitation', {
    method: 'POST',
    body: JSON.stringify({
      token: invitationToken,
      password: 'Employee@2026!',
      confirmPassword: 'Employee@2026!'
    })
  });
  assert(noEmailAcceptRes.status === 400, 'Accepting invitation without email is rejected (400)');

  // Test 6b: Accept Invitation Rejects Forwarded/Mismatched Email
  const mismatchedAcceptRes = await request('/api/auth/accept-invitation', {
    method: 'POST',
    body: JSON.stringify({
      token: invitationToken,
      email: 'unauthorized_forwarded_recipient@otherdomain.com',
      password: 'Employee@2026!',
      confirmPassword: 'Employee@2026!'
    })
  });
  assert(mismatchedAcceptRes.status === 403, 'Accepting invitation with mismatched email fails with 403 Forbidden');

  // Test 6c: Accept Invitation Succeeds with Correct Bound Email
  const acceptRes = await request('/api/auth/accept-invitation', {
    method: 'POST',
    body: JSON.stringify({
      token: invitationToken,
      email: testUserEmail,
      password: 'Employee@2026!',
      confirmPassword: 'Employee@2026!'
    })
  });
  assert(acceptRes.status === 200 && acceptRes.data.user.status === 'ACTIVE', 'User accepts invitation with matching bound email');

  // Test 6d: Token Invalidation Guarantee - Replay Attack Fails Immediately
  const replayAcceptRes = await request('/api/auth/accept-invitation', {
    method: 'POST',
    body: JSON.stringify({
      token: invitationToken,
      email: testUserEmail,
      password: 'Employee@2026!',
      confirmPassword: 'Employee@2026!'
    })
  });
  assert(replayAcceptRes.status === 400, 'Immediate Invalidation: Token cannot be reused after activation');

  // Test 7: Activated User Logs In
  const userLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: testUserEmail, password: 'Employee@2026!' })
  });
  assert(userLogin.status === 200 && !!userLogin.data.token, 'Activated user logs in successfully');
  const userToken = userLogin.data.token;

  // Test 8: Regular User Forbidden from Admin APIs
  const regularUserAdminAccess = await request('/api/admin/users', {
    method: 'GET',
    headers: { Authorization: `Bearer ${userToken}` }
  });
  assert(regularUserAdminAccess.status === 403, 'Regular user is forbidden from accessing Admin APIs (RBAC)');

  // Test 9: Regular User Updates Own Profile
  const updateProfileRes = await request('/api/users/me', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${userToken}` },
    body: JSON.stringify({ name: 'Alice Finance Manager', phone: '+1 555-9876' })
  });
  assert(updateProfileRes.status === 200 && updateProfileRes.data.user.name === 'Alice Finance Manager', 'User updates permitted profile fields');

  // Test 10: Regular User Prohibited from Changing Role or System Fields
  const tamperRoleRes = await request('/api/users/me', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${userToken}` },
    body: JSON.stringify({ role: 'SUPER_ADMIN' })
  });
  assert(tamperRoleRes.status === 403, 'User is blocked from modifying restricted system fields like role');

  // Test 11: Super Admin Deactivates User
  const deactRes = await request(`/api/admin/users/${createdUserId}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ status: 'INACTIVE' })
  });
  assert(deactRes.status === 200 && deactRes.data.user.status === 'INACTIVE', 'Super Admin deactivates user account');

  // Test 12: Inactive User Cannot Log In
  const inactiveLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: testUserEmail, password: 'Employee@2026!' })
  });
  assert(inactiveLogin.status === 403, 'Inactive user is blocked from logging in');

  // Test 13: Inactive User Cannot Access Protected Profile API
  const inactiveProfileAccess = await request('/api/users/me', {
    headers: { Authorization: `Bearer ${userToken}` }
  });
  assert(
    [401, 403].includes(inactiveProfileAccess.status),
    'Inactive user session token is blocked by middleware'
  );

  // Test 14: Super Admin Soft-Deletes User
  const deleteRes = await request(`/api/admin/users/${createdUserId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(deleteRes.status === 200 && deleteRes.data.user.isDeleted === true, 'Super Admin soft-deletes user');

  // Test 15: Soft-deleted User Hidden from Default User List
  const defaultList = await request('/api/admin/users', {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const foundInDefault = defaultList.data.users.some((u) => u._id === createdUserId);
  assert(!foundInDefault, 'Soft-deleted user is excluded from default active user list');

  // Test 16: Soft-deleted User Appears in Deleted Users Filter
  const deletedList = await request('/api/admin/users?status=DELETED', {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const foundInDeleted = deletedList.data.users.some((u) => u._id === createdUserId);
  assert(foundInDeleted, 'Soft-deleted user is listed in DELETED status filter');

  // Test 17: Super Admin Restores User
  const restoreRes = await request(`/api/admin/users/${createdUserId}/restore`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(restoreRes.status === 200 && restoreRes.data.user.isDeleted === false, 'Super Admin restores soft-deleted user');

  // Test 18: Restored User Logs In
  const restoredLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: testUserEmail, password: 'Employee@2026!' })
  });
  assert(restoredLogin.status === 200, 'Restored user can log in successfully');

  // Test 19: Super Admin Blocks User via Block API
  const blockRes = await request(`/api/admin/users/${createdUserId}/block`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(blockRes.status === 200 && blockRes.data.user.status === 'BLOCKED' && blockRes.data.user.isBlocked === true, 'Super Admin blocks user account');

  // Test 20: Blocked User Cannot Log In
  const blockedLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: testUserEmail, password: 'Employee@2026!' })
  });
  assert(blockedLogin.status === 403, 'Blocked user is forbidden from logging in');

  // Test 21: Blocked User Appears in BLOCKED Status Filter
  const blockedList = await request('/api/admin/users?status=BLOCKED', {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const foundInBlocked = blockedList.data.users.some((u) => u._id === createdUserId);
  assert(foundInBlocked, 'Blocked user is listed under status=BLOCKED filter');

  // Test 22: Super Admin Unblocks User via Unblock API
  const unblockRes = await request(`/api/admin/users/${createdUserId}/unblock`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(unblockRes.status === 200 && unblockRes.data.user.status === 'ACTIVE' && unblockRes.data.user.isBlocked === false, 'Super Admin unblocks user account');

  // Test 23: Unblocked User Can Log In
  const unblockedLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: testUserEmail, password: 'Employee@2026!' })
  });
  assert(unblockedLogin.status === 200, 'Unblocked user can log in successfully');
  const activeSessionToken = unblockedLogin.data.token;

  // Test 24: Security Review Issue 2 - Forgot Password Does NOT Expose Token in API
  const forgotPwRes = await request('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email: testUserEmail })
  });
  assert(
    forgotPwRes.status === 200 &&
    !forgotPwRes.data.devResetToken &&
    !forgotPwRes.data.token &&
    !forgotPwRes.data.resetUrl,
    'Forgot password endpoint never returns reset token or secret URLs in API payload'
  );

  // Test 25: Security Review Issue 4 - Server-Side Session Revocation on Logout
  const logoutRes = await request('/api/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${activeSessionToken}` }
  });
  assert(logoutRes.status === 200, 'User logs out and server revokes session');

  const revokedSessionAccess = await request('/api/users/me', {
    headers: { Authorization: `Bearer ${activeSessionToken}` }
  });
  assert(
    revokedSessionAccess.status === 401,
    'Revoked session token is rejected by requireAuth with 401 Unauthorized'
  );

  // Test 26: Re-login succeeds after revocation
  const reloginRes = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: testUserEmail, password: 'Employee@2026!' })
  });
  assert(reloginRes.status === 200 && !!reloginRes.data.token, 'User obtains a fresh valid session token upon re-login');

  console.log(`\n--- AUTOMATED VERIFICATION COMPLETED: ${testFailures === 0 ? 'ALL PASSED!' : `${testFailures} FAILURES`} ---\n`);
  process.exit(testFailures === 0 ? 0 : 1);
};

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
