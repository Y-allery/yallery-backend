/**
 * Swagger documentation descriptions for Auth Controller
 * Centralized location for all auth-related API documentation
 */

export const AUTH_SWAGGER = {
  login: {
    summary: 'User login',
    description: `Authenticate a user with email and password. Returns JWT access token and refresh token for authenticated requests.

**Authentication Flow:**
1. Validates user credentials (email and password)
2. Checks if email is verified
3. Returns access token (short-lived) and refresh token (long-lived)
4. Access token must be included in Authorization header for protected endpoints

**Response includes:**
- \`accessToken\`: JWT token for API authentication (expires in 1 hour)
- \`refreshToken\`: Token for refreshing access token (expires in 7 days)
- \`user\`: User profile information`,
    responses: {
      success: {
        status: 200,
        description: 'Login successful - returns access token, refresh token, and user data',
        schema: {
          type: 'object',
          properties: {
            accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
            refreshToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'number' },
                email: { type: 'string' },
                name: { type: 'string' },
                nickname: { type: 'string', nullable: true }
              }
            }
          }
        }
      },
      unauthorized: { status: 401, description: 'Invalid credentials or email not verified' },
      badRequest: { status: 400, description: 'Bad request - missing or invalid input' }
    }
  },
  adminLogin: {
    summary: 'Admin login',
    description: `Authenticate an admin user with email and password. Requires admin role. Returns JWT tokens with admin privileges.

**Admin Access:**
- Only users with ADMIN role can access this endpoint
- Admin tokens provide access to admin-only endpoints
- Same token structure as regular login but with elevated permissions`,
    responses: {
      success: { status: 200, description: 'Admin login successful - returns access token, refresh token, and admin user data' },
      unauthorized: { status: 401, description: 'Invalid credentials or user is not an admin' },
      forbidden: { status: 403, description: 'Forbidden - user does not have admin role' }
    }
  },
  register: {
    summary: 'User registration',
    description: `Create a new user account. After registration, a verification email will be sent to the provided email address.

**Registration Process:**
1. Validates email format and password strength
2. Checks if email is already registered
3. Creates new user account (initially unverified)
4. Sends verification email to the provided address
5. Returns user data and tokens (email must be verified before full access)

**Email Verification:**
- User must click the verification link in the email
- Unverified accounts have limited access
- Verification link expires after 24 hours`,
    responses: {
      success: {
        status: 201,
        description: 'Registration successful - user created and verification email sent',
        schema: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'number' },
                email: { type: 'string' },
                name: { type: 'string' },
                emailVerified: { type: 'boolean', example: false }
              }
            }
          }
        }
      },
      badRequest: { status: 400, description: 'Bad request - email already exists, invalid input, or weak password' },
      conflict: { status: 409, description: 'Conflict - email is already registered' }
    }
  },
  resendEmail: {
    summary: 'Resend verification email',
    description: `Resend the email verification link to a user's email address. Useful when the original verification email was not received or expired.

**Use Cases:**
- Original email was lost or deleted
- Verification link expired (links expire after 24 hours)
- Email delivery issues

**Rate Limiting:**
- Prevents email spam by limiting resend frequency
- New verification link invalidates previous links`,
    responses: {
      success: {
        status: 200,
        description: 'Verification email sent successfully',
        schema: {
          type: 'object',
          properties: {
            message: { type: 'string', example: 'Verification email sent successfully' }
          }
        }
      },
      notFound: { status: 404, description: 'User with this email not found' },
      badRequest: { status: 400, description: 'Email already verified or rate limit exceeded' }
    }
  },
  verifyEmail: {
    summary: 'Verify email address',
    description: `Verify a user's email address using the token sent in the verification email. This is typically accessed via a link in the email.

**Verification Process:**
1. Validates the verification token
2. Marks user's email as verified
3. Grants full account access
4. Returns success page or redirects

**Token Validity:**
- Tokens expire after 24 hours
- Each token can only be used once
- Invalid or expired tokens show an error page`,
    responses: {
      success: { status: 200, description: 'Email verified successfully - returns HTML success page' },
      badRequest: { status: 400, description: 'Invalid or expired token - returns HTML error page' }
    }
  },
  refresh: {
    summary: 'Refresh access token',
    description: `Obtain a new access token using a valid refresh token. Use this when your access token expires.

**Token Refresh:**
- Refresh tokens are long-lived (7 days)
- New access token expires in 1 hour
- Refresh token can be reused until it expires`,
    responses: {
      success: { status: 200, description: 'New access token generated successfully' },
      unauthorized: { status: 401, description: 'Invalid or expired refresh token' }
    }
  },
  requestResetPassword: {
    summary: 'Request password reset',
    description: `Request a password reset link to be sent to your email address. The link will allow you to set a new password.

**Process:**
1. Validates email exists in system
2. Generates secure reset token
3. Sends reset link via email
4. Token expires after 1 hour`,
    responses: {
      success: { status: 200, description: 'Password reset link sent to email' },
      notFound: { status: 404, description: 'Email not found' }
    }
  },
  resetPassword: {
    summary: 'Reset password',
    description: `Set a new password using the reset token from the email link.`,
    responses: {
      success: { status: 200, description: 'Password reset successfully' },
      badRequest: { status: 400, description: 'Invalid or expired token' }
    }
  },
  requestChangeEmail: {
    summary: 'Request email change',
    description: `Request to change your email address. A confirmation link will be sent to your current email.`,
    responses: {
      success: { status: 200, description: 'Confirmation link sent to current email' }
    }
  },
  confirmChangeEmail: {
    summary: 'Confirm email change',
    description: `Confirm and complete the email change process using the token from the confirmation email.`,
    responses: {
      success: { status: 200, description: 'Email changed successfully' },
      badRequest: { status: 400, description: 'Invalid or expired token' }
    }
  },
  googleLogin: {
    summary: 'Login with Google',
    description: `Authenticate using Google OAuth. Requires a valid Google access token.

**OAuth Flow:**
1. User authenticates with Google
2. Frontend receives Google access token
3. Backend verifies token with Google
4. Creates or updates user account
5. Returns JWT tokens`,
    responses: {
      success: { status: 200, description: 'Google login successful' },
      unauthorized: { status: 401, description: 'Invalid Google token' }
    }
  },
  appleLogin: {
    summary: 'Login with Apple',
    description: `Authenticate using Apple Sign In. Requires a valid Apple identity token.`,
    responses: {
      success: { status: 200, description: 'Apple login successful' },
      unauthorized: { status: 401, description: 'Invalid Apple token' }
    }
  },
  telegramLogin: {
    summary: 'Login with Telegram',
    description: `Authenticate using Telegram Web App initData.`,
    responses: {
      success: { status: 200, description: 'Telegram login successful' },
      unauthorized: { status: 401, description: 'Invalid Telegram data' }
    }
  }
};
