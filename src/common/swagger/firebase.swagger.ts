export const FIREBASE_SWAGGER = {
  sendNotification: {
    summary: 'Send push notification',
    description: `Send a push notification to a specific device using Firebase Cloud Messaging. Requires a valid device token.`,
    responses: {
      success: { status: 201, description: 'Notification sent successfully' },
      badRequest: { status: 400, description: 'Invalid input - missing token, title, or body' },
      internalError: { status: 500, description: 'Failed to send notification' }
    }
  }
};
