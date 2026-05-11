import axios from 'axios';
import { TwitterApiIoService } from './twitter-api-io.service';

jest.mock('axios');

describe('TwitterApiIoService', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  function createService(overrides: Record<string, any> = {}) {
    const values = {
      TWITTERAPI_IO_API_KEY: 'test-key',
      TWITTERAPI_IO_API_URL: 'https://api.test',
      TWITTERAPI_IO_RETWEETER_MAX_PAGES: '10',
      TWITTERAPI_IO_PAGE_SIZE: '200',
      ...overrides,
    };
    return new TwitterApiIoService({
      get: jest.fn((key: string) => values[key]),
    } as any);
  }

  beforeEach(() => {
    mockedAxios.get.mockReset();
  });

  it('uses TwitterAPI.io base URL, X-API-Key header, and search params', async () => {
    const service = createService();
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        tweets: [
          {
            id: '1',
            text: 'hello @y_allery',
            likeCount: 3,
            retweetCount: 2,
            replyCount: 1,
            viewCount: 100,
          },
        ],
        has_next_page: false,
        next_cursor: '',
      },
    });

    const result = await service.searchTweets(
      'from:test @y_allery',
      'Latest',
      100,
      200,
    );

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://api.test/twitter/tweet/advanced_search',
      {
        headers: {
          'X-API-Key': 'test-key',
          Accept: 'application/json',
        },
        params: {
          query: 'from:test @y_allery since_time:100 until_time:200',
          queryType: 'Latest',
        },
      },
    );
    expect(result.tweets[0]).toMatchObject({
      id_str: '1',
      full_text: 'hello @y_allery',
      favorite_count: 3,
      retweet_count: 2,
      reply_count: 1,
      view_count: 100,
    });
  });

  it('normalizes user profile fields and heuristic score', async () => {
    const service = createService();
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        data: {
          id: '42',
          userName: 'y_allery',
          name: "Y'allery",
          followers: 1000,
          following: 100,
          statusesCount: 250,
          mediaCount: 50,
          isBlueVerified: true,
        },
      },
    });

    const profile = await service.getUserProfile('@y_allery');

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://api.test/twitter/user/info',
      expect.objectContaining({
        params: { userName: 'y_allery' },
      }),
    );
    expect(profile).toMatchObject({
      id: '42',
      id_str: '42',
      userName: 'y_allery',
      screenName: 'y_allery',
      followersCount: 1000,
      friendsCount: 100,
      verified: true,
    });
    expect(profile.score).toBeGreaterThan(0);
  });

  it('does not call TwitterAPI.io when the API key is missing', async () => {
    const service = createService({ TWITTERAPI_IO_API_KEY: undefined });

    await expect(service.getUserProfile('y_allery')).rejects.toThrow(
      'TwitterAPI.io API key is not configured',
    );
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('checks retweeter pages until a matching user is found', async () => {
    const service = createService();
    mockedAxios.get
      .mockResolvedValueOnce({
        data: {
          data: {
            id: 'target-id',
            userName: 'target',
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          users: [{ id: 'other-id', userName: 'other' }],
          has_next_page: true,
          next_cursor: 'next-page',
        },
      })
      .mockResolvedValueOnce({
        data: {
          users: [{ id: 'target-id', userName: 'target' }],
          has_next_page: false,
          next_cursor: '',
        },
      });

    const result = await service.verifyUserRetweeted('tweet-id', '@target');

    expect(result).toEqual({
      retweet: true,
      pagesChecked: 2,
      userId: 'target-id',
    });
    expect(mockedAxios.get).toHaveBeenNthCalledWith(
      3,
      'https://api.test/twitter/tweet/retweeters',
      expect.objectContaining({
        params: {
          tweetId: 'tweet-id',
          cursor: 'next-page',
        },
      }),
    );
  });

  it('stops retweeter verification at the configured max pages', async () => {
    const service = createService({ TWITTERAPI_IO_RETWEETER_MAX_PAGES: '1' });
    mockedAxios.get
      .mockResolvedValueOnce({
        data: {
          data: {
            id: 'target-id',
            userName: 'target',
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          users: [{ id: 'other-id', userName: 'other' }],
          has_next_page: true,
          next_cursor: 'next-page',
        },
      });

    const result = await service.verifyUserRetweeted('tweet-id', 'target');

    expect(result).toEqual({
      retweet: false,
      pagesChecked: 1,
      userId: 'target-id',
    });
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
  });
});
