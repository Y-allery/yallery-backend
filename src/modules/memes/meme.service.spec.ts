import { MemeService } from 'src/modules/memes/meme.service';

/**
 * listForApp used to load every post with generationParams into memory and
 * JSON.parse each row to tally per-meme counts. It now uses a SQL GROUP BY
 * aggregation cached for 60s. These tests pin the aggregation mapping, the
 * popular/regular split semantics and the cache behaviour.
 */
describe('MemeService.listForApp', () => {
  const makeMeme = (id: number) => ({
    id,
    name: `meme-${id}`,
    referenceVideoUrl: null,
    referenceVideoDurationSeconds: null,
    referenceImageUrl: null,
    isActive: true,
    tag: { id: 100 + id, name: `tag${id}`, imageUrl: `img${id}` },
  });

  const createService = ({
    memes = [1, 2, 3, 4, 5, 6, 7, 8].map(makeMeme),
    countRows = [] as Array<Record<string, unknown>>,
  } = {}) => {
    const memeRepository = { find: jest.fn(async () => memes) };
    const query = jest.fn(async () => countRows);
    const postRepository = { query };
    const mediaAISettingsRepository = { findOne: jest.fn(async () => null) };

    const service = new MemeService(
      memeRepository as any,
      postRepository as any,
      mediaAISettingsRepository as any,
    );
    return { service, query };
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps aggregated counts and splits popular (top 6 by month, stable) vs regular', async () => {
    const { service } = createService({
      countRows: [
        // driver may return DECIMAL sums as strings
        { memeId: 3, total: '10', thisMonth: '5' },
        { memeId: 7, total: 4, thisMonth: 2 },
        { memeId: 1, total: '1', thisMonth: '0' },
        // not an active meme id — must be ignored
        { memeId: 99, total: '50', thisMonth: '50' },
      ],
    });

    const result = await service.listForApp();

    // stable sort: month-count ties keep id ASC order
    expect(result.popular.map((m) => m.id)).toEqual([3, 7, 1, 2, 4, 5]);
    expect(result.regular.map((m) => m.id)).toEqual([6, 8]);

    const byId = new Map(
      [...result.popular, ...result.regular].map((m) => [m.id, m]),
    );
    expect(byId.get(3)!.generationsCount).toBe(10);
    expect(byId.get(7)!.generationsCount).toBe(4);
    expect(byId.get(1)!.generationsCount).toBe(1);
    expect(byId.get(2)!.generationsCount).toBe(0);

    // response shape stays intact
    const meme = byId.get(3)!;
    expect(meme.suggestedTags).toEqual([
      { id: 103, name: '#tag3', imageUrl: 'img3' },
    ]);
    expect(meme).toMatchObject({
      durationSeconds: null,
      billableDurationSeconds: null,
      creditsPerSecond: null,
      totalCost: 0,
      pricingStrategy: 'fixed',
    });
  });

  it('returns empty lists without querying counts when no active memes', async () => {
    const { service, query } = createService({ memes: [] });

    await expect(service.listForApp()).resolves.toEqual({
      popular: [],
      regular: [],
    });
    expect(query).not.toHaveBeenCalled();
  });

  it('caches the counts query for 60s and re-runs it after expiry', async () => {
    const { service, query } = createService({
      countRows: [{ memeId: 1, total: '2', thisMonth: '1' }],
    });

    let now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);

    await service.listForApp();
    await service.listForApp();
    expect(query).toHaveBeenCalledTimes(1);

    now += 61_000;
    await service.listForApp();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('passes the current month start as the SQL parameter', async () => {
    const { service, query } = createService();

    await service.listForApp();

    const [sql, params] = query.mock.calls[0] as unknown as [string, Date[]];
    expect(sql).toContain('GROUP BY memeId');
    expect(sql).toContain("JSON_EXTRACT(p.generationParams, '$.memeId')");
    const nowDate = new Date();
    expect(params[0]).toEqual(
      new Date(nowDate.getFullYear(), nowDate.getMonth(), 1),
    );
  });
});
