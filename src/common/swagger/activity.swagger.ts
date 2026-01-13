export const ACTIVITY_SWAGGER = {
  getUserActivities: {
    summary: 'Get filtered user activities',
    description: `Retrieve user activities filtered by type (earned or spent) and time period (day, week, month, year). Activities include credit transactions, rewards, and engagement actions.`,
    responses: {
      success: { status: 200, description: 'Activities retrieved successfully' }
    }
  },
  getPaginatedActivities: {
    summary: 'Get paginated activities',
    description: `Retrieve paginated list of all activities for the authenticated user. Includes skip and take parameters for pagination control.`,
    responses: {
      success: { status: 200, description: 'Activities retrieved successfully' }
    }
  },
  markAllActivitiesAsRead: {
    summary: 'Mark all activities as read',
    description: `Mark all activity notifications as read for the authenticated user.`,
    responses: {
      success: { status: 200, description: 'All activities marked as read' }
    }
  },
  markContestActivitiesAsRead: {
    summary: 'Mark contest activities as read',
    description: `Mark all contest-related activity notifications as read.`,
    responses: {
      success: { status: 200, description: 'Contest activities marked as read' }
    }
  },
  markCollabsActivitiesAsRead: {
    summary: 'Mark collaboration activities as read',
    description: `Mark all collaboration-related activity notifications as read.`,
    responses: {
      success: { status: 200, description: 'Collaboration activities marked as read' }
    }
  },
  getActivityTypes: {
    summary: 'Get activity types',
    description: `Retrieve available activity types with their notification preferences. Used for configuring which activities trigger notifications.`,
    responses: {
      success: { status: 200, description: 'Activity types retrieved successfully' }
    }
  },
  getPopularPosts: {
    summary: 'Get popular posts',
    description: `Retrieve the 6 most popular posts based on likes and views. Used for showcasing trending content.`,
    responses: {
      success: { status: 200, description: 'Popular posts retrieved successfully' }
    }
  },
  markPostsAsViewed: {
    summary: 'Mark posts as viewed in activity',
    description: `Mark multiple posts as viewed for activity tracking purposes.`,
    responses: {
      success: { status: 200, description: 'Posts marked as viewed successfully' }
    }
  }
};
