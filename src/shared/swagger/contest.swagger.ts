export const CONTEST_SWAGGER = {
  getAllContests: {
    summary: 'Get all contests',
    description: `Retrieve all available contests. Can be filtered by type (DEFAULT or FINE_TUNE) and/or status (open, closed, pending_review). If no filters are provided, returns all contests. Contests include active competitions where users can participate and win rewards.`,
    responses: {
      success: { status: 200, description: 'Contests retrieved successfully' }
    }
  },
  getMyContests: {
    summary: 'Get user contests',
    description: `Retrieve all contests where the authenticated user has participated. Includes participation status and current standings.`,
    responses: {
      success: { status: 200, description: 'User contests retrieved successfully' }
    }
  },
  getWonContests: {
    summary: 'Get won contests',
    description: `Retrieve all contests where the authenticated user has won prizes.`,
    responses: {
      success: { status: 200, description: 'Won contests retrieved successfully' }
    }
  },
  getPostsByContest: {
    summary: 'Get contest posts',
    description: `Retrieve all posts submitted to a specific contest. Supports pagination. Posts are typically sorted by likes or submission date.`,
    responses: {
      success: { status: 200, description: 'Contest posts retrieved successfully' },
      notFound: { status: 404, description: 'Contest not found' }
    }
  },
  getExampleContest: {
    summary: 'Get example contest',
    description: `Retrieve an example contest template for reference. Used for understanding contest structure and requirements.`,
    responses: {
      success: { status: 200, description: 'Example contest retrieved successfully' }
    }
  },
  joinContest: {
    summary: 'Join contest',
    description: `Participate in a contest. User can then submit posts to compete for prizes.`,
    responses: {
      success: { status: 200, description: 'Successfully joined contest' },
      badRequest: { status: 400, description: 'Contest is closed or already joined' },
      notFound: { status: 404, description: 'Contest not found' }
    }
  },
  getContestById: {
    summary: 'Get contest by ID',
    description: `Retrieve detailed information about a specific contest including rules, prizes, deadlines, and current participants.`,
    responses: {
      success: { status: 200, description: 'Contest retrieved successfully' },
      notFound: { status: 404, description: 'Contest not found' }
    }
  }
};
