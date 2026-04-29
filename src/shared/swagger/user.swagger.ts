export const USER_SWAGGER = {
  generateReferralCode: {
    summary: 'Generate referral code',
    description: `Generate a unique referral code for the authenticated user. This code can be shared with others to earn rewards when they register using your code.`,
    responses: {
      success: { status: 200, description: 'Referral code generated successfully' }
    }
  },
  useReferralCode: {
    summary: 'Use referral code',
    description: `Apply a referral code from another user to receive referral benefits. Can only be used once per user.`,
    responses: {
      success: { status: 200, description: 'Referral code applied successfully' },
      badRequest: { status: 400, description: 'Invalid or already used referral code' }
    }
  },
  getProfile: {
    summary: 'Get user profile',
    description: `Retrieve complete profile information for the authenticated user including personal details, statistics, and preferences.`,
    responses: {
      success: { status: 200, description: 'User profile retrieved successfully' },
      unauthorized: { status: 401, description: 'Unauthorized' }
    }
  },
  updateUserDetails: {
    summary: 'Update user details',
    description: `Update user profile information including password, nickname, name, or email. All fields are optional - only provided fields will be updated.`,
    responses: {
      success: { status: 200, description: 'User details updated successfully' },
      badRequest: { status: 400, description: 'Invalid input or nothing to update' }
    }
  },
  addTagsToUser: {
    summary: 'Add tags to user profile',
    description: `Associate interest tags with the user profile. Tags help personalize content and recommendations.`,
    responses: {
      success: { status: 200, description: 'Tags added successfully' },
      badRequest: { status: 400, description: 'Invalid tag IDs' }
    }
  },
  removeTagFromUser: {
    summary: 'Remove tag from user profile',
    description: `Remove a specific tag from the user's profile.`,
    responses: {
      success: { status: 200, description: 'Tag removed successfully' },
      notFound: { status: 404, description: 'User or tag not found' }
    }
  },
  deleteUserAccount: {
    summary: 'Delete user account',
    description: `Permanently delete the user account and all associated data. This action cannot be undone.`,
    responses: {
      success: { status: 200, description: 'Account deleted successfully' },
      unauthorized: { status: 401, description: 'Unauthorized' }
    }
  },
  registerDeviceToken: {
    summary: 'Register device token for push notifications',
    description: `Register a device token to receive push notifications. Supports iOS and Android devices.`,
    responses: {
      success: { status: 200, description: 'Device token registered successfully' },
      badRequest: { status: 400, description: 'Invalid device token or type' }
    }
  },
  unregisterDeviceTokensByType: {
    summary: 'Unregister device tokens by type',
    description: `Remove all device tokens for a specific device type (iOS or Android). Useful when logging out from a device.`,
    responses: {
      success: { status: 200, description: 'Device tokens unregistered successfully' },
      notFound: { status: 404, description: 'No tokens found for this device type' }
    }
  },
  setNotificationPreference: {
    summary: 'Update notification preference',
    description: `Enable or disable push notifications for the user.`,
    responses: {
      success: { status: 200, description: 'Notification preference updated successfully' }
    }
  },
  updateAvatar: {
    summary: 'Update user avatar',
    description: `Upload and set a new profile picture. Accepts image files (JPG, PNG). Image will be automatically resized and optimized.`,
    responses: {
      success: { status: 200, description: 'Avatar updated successfully' },
      badRequest: { status: 400, description: 'Invalid file or file is required' }
    }
  },
  changePassword: {
    summary: 'Change password',
    description: `Update user password. Requires current password for verification.`,
    responses: {
      success: { status: 200, description: 'Password changed successfully' },
      badRequest: { status: 400, description: 'Invalid current password or weak new password' }
    }
  },
  updateName: {
    summary: 'Update user name',
    description: `Change the user's display name.`,
    responses: {
      success: { status: 200, description: 'Name updated successfully' },
      badRequest: { status: 400, description: 'Invalid name' }
    }
  },
  updateNickname: {
    summary: 'Update user nickname',
    description: `Change the user's unique nickname. Must be unique across the platform.`,
    responses: {
      success: { status: 200, description: 'Nickname updated successfully' },
      badRequest: { status: 400, description: 'Nickname already taken or invalid' }
    }
  },
  updateTwitterUsername: {
    summary: 'Update Twitter username',
    description: `Link or update the Twitter username associated with the account for social features.`,
    responses: {
      success: { status: 200, description: 'Twitter username updated successfully' }
    }
  },
  logReferralActivity: {
    summary: 'Log referral activity',
    description: `Record a referral-related activity for tracking and analytics purposes.`,
    responses: {
      success: { status: 201, description: 'Activity logged successfully' },
      notFound: { status: 404, description: 'Referral not found' }
    }
  }
};
