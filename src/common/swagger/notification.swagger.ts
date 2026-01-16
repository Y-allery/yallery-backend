export const NOTIFICATION_SWAGGER = {
  getNotificationTypes: {
    summary: 'Get notification types',
    description: `Retrieve available notification types with current user preferences. Used for configuring which activities trigger notifications.`,
    responses: {
      success: { status: 200, description: 'Notification types retrieved successfully' },
    },
  },
  setPreference: {
    summary: 'Set notification preference',
    description: `Configure notification preferences for specific activity types. Users can enable or disable notifications for different types of activities (likes, comments, contests, etc.).`,
    responses: {
      success: { 
        status: 200, 
        description: 'Notification preference updated successfully',
        schema: {
          type: 'object',
          properties: {
            message: { type: 'string', example: 'Preference updated successfully' }
          }
        }
      },
      badRequest: { status: 400, description: 'Invalid activity type or preference value' }
    }
  }
};
