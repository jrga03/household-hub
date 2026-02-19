# Authentication - QA Test Scripts

---

## Test ID: AUTH-001

## Login with valid credentials

## Priority: High

### Preconditions

- User account exists: test@example.com / TestPassword123!
- User is logged out

### Steps

1. Navigate to `http://localhost:3000/login`
2. Enter `test@example.com` in the Email field (`input[name="email"]`)
3. Enter `TestPassword123!` in the Password field (`input[name="password"]`)
4. Click the "Sign In" button (`button[type="submit"]`)

### Expected Results

- [ ] Page redirects to `/dashboard` or `/transactions`
- [ ] No error messages displayed
- [ ] User name or email visible in the sidebar/header
- [ ] Navigation menu is accessible

### Cleanup

None needed

---

## Test ID: AUTH-002

## Login with invalid credentials

## Priority: High

### Preconditions

- User is logged out

### Steps

1. Navigate to `http://localhost:3000/login`
2. Enter `test@example.com` in the Email field
3. Enter `WrongPassword123!` in the Password field
4. Click the "Sign In" button

### Expected Results

- [ ] Error message displayed (e.g., "Invalid login credentials")
- [ ] User remains on the login page
- [ ] Password field is cleared or highlighted
- [ ] No redirect occurs

### Cleanup

None needed

---

## Test ID: AUTH-003

## Signup with new email

## Priority: Medium

### Preconditions

- Email `newuser-test@example.com` does not have an account

### Steps

1. Navigate to `http://localhost:3000/login`
2. Click "Sign Up" or "Create Account" link/tab
3. Enter `newuser-test@example.com` in the Email field
4. Enter `TestPassword123!` in the Password field
5. Confirm password if a confirmation field exists
6. Click the "Sign Up" button

### Expected Results

- [ ] Success message or confirmation email notice displayed
- [ ] No error messages
- [ ] User may be redirected to dashboard or shown email verification notice

### Cleanup

Delete the test account from Supabase dashboard if created

---

## Test ID: AUTH-004

## Logout with clean state

## Priority: High

### Preconditions

- Logged in as test@example.com
- No unsynced offline data

### Steps

1. Locate the user menu or logout button in the sidebar/header
2. Click "Sign Out" or "Log Out" button
3. Observe the logout behavior

### Expected Results

- [ ] User is redirected to `/login`
- [ ] No error messages
- [ ] Navigation shows logged-out state
- [ ] Attempting to visit `/dashboard` redirects back to `/login`

### Cleanup

None needed

---

## Test ID: AUTH-005

## Logout with unsynced data (warning dialog)

## Priority: High

### Preconditions

- Logged in as test@example.com
- Create a transaction while offline (disable network in DevTools)
- Re-enable network but do NOT sync

### Steps

1. Open Chrome DevTools > Network > check "Offline"
2. Create a transaction (any amount, description "[E2E] Offline Test")
3. Uncheck "Offline" in DevTools
4. Immediately click "Sign Out" before sync completes

### Expected Results

- [ ] A confirmation dialog appears warning about unsynced data
- [ ] Dialog mentions option to export data
- [ ] Clicking "Cancel" or declining export keeps user logged in
- [ ] Clicking "OK" or accepting export downloads a CSV backup
- [ ] After export, user is signed out

### Cleanup

1. Log back in
2. Delete the "[E2E] Offline Test" transaction
