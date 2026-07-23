import { ContentBotService } from './content-bot.service';

/**
 * The safety-critical guarantees the adversarial review flagged:
 *  1. publishDuePaced publishes ONLY drafts that match a today, non-preview
 *     'generating' plan — never preview drafts, never prior-day leftovers.
 *  2. It never overshoots the paced budget.
 *  3. It skips a plan whose tag became contest-locked after planning.
 *  4. runPreview creates isPreview=true rows and never publishes.
 */
describe('ContentBotService publishing safety', () => {
  const CONFIG: Record<string, number> = {
    CONTENT_BOT_USER_ID: 42,
    CONTENT_BOT_DAILY_POSTS: 10,
    CONTENT_BOT_VIDEO_SHARE: 0.6,
    CONTENT_BOT_MAX_DAILY_ITEMS: 50,
  };

  const makeService = ({
    generatingPlans = [] as any[],
    drafts = [] as any[],
    lockedTagRows = [] as any[],
    tags = [{ id: 11, name: 'girl' }] as any[],
  } = {}) => {
    const planRepository = {
      find: jest.fn(async ({ where }: any) =>
        where?.status === 'generating' ? generatingPlans : [],
      ),
      count: jest.fn(async () => 0),
      query: jest.fn(async () => lockedTagRows),
      create: jest.fn((x: any) => ({ ...x })),
      save: jest.fn(async (x: any) => x),
    };
    const postRepository = {
      find: jest.fn(async () => drafts),
      save: jest.fn(async (x: any) => x),
    };
    const tagRepository = { find: jest.fn(async () => tags) };
    const userRepository = {
      findOne: jest.fn(async () => ({ id: 42, points: 2_000_000 })),
      create: jest.fn((x: any) => x),
      save: jest.fn(async (x: any) => ({ id: 42, ...x })),
      increment: jest.fn(async () => ({})),
    };
    const chargeRepository = { findOne: jest.fn(async () => null) };
    const providerRuntimeConfigService = {
      getBoolean: jest.fn(async () => false),
      getNumber: jest.fn(async (key: string) => CONFIG[key]),
      getString: jest.fn(async () => null),
      updateSetting: jest.fn(async () => ({})),
    };
    const enqueueService = {
      enqueueTextVideoGeneration: jest.fn(async () => ({ id: 'task-v' })),
      enqueuePromptImageGeneration: jest.fn(async () => ({ id: 'task-i' })),
    };
    const telegramService = {
      sendMessage: jest.fn(),
      sendMediaGroup: jest.fn(),
    };
    const promptService = {
      generate: jest.fn(async (briefs: any[]) => briefs.map(() => null)),
    };

    const service = new ContentBotService(
      planRepository as any,
      postRepository as any,
      tagRepository as any,
      userRepository as any,
      chargeRepository as any,
      providerRuntimeConfigService as any,
      enqueueService as any,
      telegramService as any,
      promptService as any,
    );
    // Pin pacing to a full day so the budget is deterministic (target vs cap).
    jest.spyOn(service as any, 'dayFraction').mockReturnValue(1);
    return {
      service,
      planRepository,
      postRepository,
      enqueueService,
    };
  };

  const imgPlan = (over: any = {}) => ({
    id: 1,
    mediaKind: 'image',
    promptText: 'P1',
    seed: null,
    tagId: 11,
    status: 'generating',
    isPreview: false,
    ...over,
  });
  const imgDraft = (over: any = {}) => ({
    id: 100,
    imageUrl: 'i',
    videoUrl: null,
    generationParams: { prompt: 'P1' },
    tag: { id: 99 },
    ...over,
  });

  it('publishes only drafts that match a today non-preview generating plan', async () => {
    const { service, postRepository, planRepository } = makeService({
      generatingPlans: [imgPlan()],
      drafts: [
        imgDraft({ id: 100, generationParams: { prompt: 'P1' } }), // matches
        imgDraft({ id: 101, generationParams: { prompt: 'nope' } }), // no match
      ],
    });

    const res = await service.publishDuePaced();

    expect(res.published).toBe(1);
    // The matched draft is published under the PLAN's tag (11), not draft.tag(99).
    const published = postRepository.save.mock.calls.map(([p]: any) => p);
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({
      id: 100,
      isPublished: true,
      isSaved: false,
      tag: { id: 11 },
    });
    // Unmatched draft 101 was never saved/published.
    expect(published.find((p: any) => p.id === 101)).toBeUndefined();
    // The generating-plans query is scoped to non-preview rows.
    const genCall = planRepository.find.mock.calls.find(
      ([arg]: any) => arg?.where?.status === 'generating',
    );
    expect(genCall[0].where).toMatchObject({
      status: 'generating',
      isPreview: false,
    });
  });

  it('never overshoots the per-tick budget', async () => {
    // 5 matched drafts available, but PUBLISH_PER_TICK_MAX caps a tick at 3.
    const plans = [1, 2, 3, 4, 5].map((id) =>
      imgPlan({ id, promptText: `P${id}` }),
    );
    const drafts = [1, 2, 3, 4, 5].map((id) =>
      imgDraft({ id: 100 + id, generationParams: { prompt: `P${id}` } }),
    );
    const { service, postRepository } = makeService({
      generatingPlans: plans,
      drafts,
    });

    const res = await service.publishDuePaced();

    expect(res.published).toBe(3);
    expect(postRepository.save).toHaveBeenCalledTimes(3);
  });

  it('skips a plan whose tag became contest-locked after planning', async () => {
    const { service, postRepository } = makeService({
      generatingPlans: [imgPlan({ tagId: 11 })],
      drafts: [imgDraft()],
      lockedTagRows: [{ tagId: 11 }], // girl tag now has an open contest
    });

    const res = await service.publishDuePaced();

    expect(res.published).toBe(0);
    expect(postRepository.save).not.toHaveBeenCalled();
  });

  it('runPreview generates isPreview rows and never publishes', async () => {
    const { service, postRepository, planRepository, enqueueService } =
      makeService();

    const res = await service.runPreview(2);

    // Rows were created as preview rows.
    const created = planRepository.create.mock.calls.map(([r]: any) => r);
    expect(created.length).toBeGreaterThan(0);
    expect(created.every((r: any) => r.isPreview === true)).toBe(true);
    const imageRows = created.filter((r: any) => r.mediaKind === 'image');
    expect(imageRows.length).toBeGreaterThan(0);
    expect(
      imageRows.every((r: any) => r.aiService === 'z_image_turbo'),
    ).toBe(true);
    // Generation was attempted, but nothing was ever published.
    expect(
      enqueueService.enqueuePromptImageGeneration.mock.calls.length +
        enqueueService.enqueueTextVideoGeneration.mock.calls.length,
    ).toBeGreaterThan(0);
    expect(postRepository.save).not.toHaveBeenCalled();
    expect(res.planned).toBeGreaterThan(0);
  });
});
