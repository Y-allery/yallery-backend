/**
 * Static prompt bank + tag-selection weights for the content bot.
 *
 * Prompts are normally written fresh by the LLM (ContentBotPromptService); this
 * bank is the FALLBACK used when OpenAI is unavailable or errors. Tag-selection
 * weights/blocklist/style hints below drive selection in both paths.
 *
 * SFW POSTURE (the bot posts from an official AI-curator account, so an off-brand
 * slip risks App Store / Play removal — Apple 1.1.4/1.2, Google UGC AI policy):
 *  - Strictly SFW, adults only, glamour/fashion/portrait — no nudity/sexualisation.
 *  - No real people / celebrity likeness (a separate axis from NSFW that model
 *    guards don't cover) — enforced via the LLM system prompt; `celebrity`/`other`
 *    tags are blocklisted.
 * Enforcement lives in the LLM instruction + OpenAI policy + the models' built-in
 * NSFW protection — NOT in a keyword filter or the (advisory) negative prompt.
 *
 * Weighting biases toward the highest-engagement themes measured in production
 * (girl ~6.3 likes/post, fashion ~6.3) plus tasteful Asian glamour, while still
 * seeding a long tail of tags "a little bit". `preferVideo` marks templates that
 * shine as motion (video is cheap on the optimised LTX worker and under-supplied
 * in the app — only ~2.4% of posts are video).
 */

/**
 * Advisory negative terms stored on plan rows. NOTE: the backend does NOT
 * forward negatives to the RunPod worker (the worker owns per-model negatives),
 * so this is not an active runtime filter. Real SFW enforcement is: the LLM
 * prompt-writer instruction + OpenAI's own content policy + the image/video
 * models' built-in NSFW protection. Kept here for provenance / future use.
 */
export const SFW_NEGATIVE_PROMPT = [
  'nsfw',
  'nude',
  'nudity',
  'naked',
  'lingerie',
  'underwear',
  'cleavage',
  'sexual',
  'suggestive',
  'provocative pose',
  'fetish',
  'minor',
  'child',
  'teen',
  'underage',
  'celebrity',
  'real person',
  'famous face',
  'text',
  'watermark',
  'logo',
  'signature',
  'deformed',
  'extra fingers',
  'bad anatomy',
  'lowres',
  'blurry',
  'jpeg artifacts',
].join(', ');

export interface BotPromptTemplate {
  key: string;
  /** Tag names (matched case-insensitively to tags.name at plan time). */
  tags: string[];
  prompt: string;
  /** Appended after SFW_NEGATIVE_PROMPT. */
  extraNegative?: string;
  /** Relative selection weight (higher = more frequent). */
  weight: number;
  /** Hint that this template is best delivered as motion. */
  preferVideo?: boolean;
}

export const BOT_PROMPT_TEMPLATES: BotPromptTemplate[] = [
  // ---- girl / beauty / fashion — the engagement core (SFW glamour) ----
  {
    key: 'girl-editorial-studio',
    tags: ['girl', 'beauty', 'fashion'],
    prompt:
      'editorial fashion portrait of an elegant adult woman, soft studio softbox lighting, natural flawless skin, minimal tasteful makeup, tailored modern outfit, shallow depth of field, 85mm lens, high-end magazine aesthetic, refined and classy',
    weight: 10,
    preferVideo: true,
  },
  {
    key: 'girl-asian-kbeauty',
    tags: ['girl', 'beauty'],
    prompt:
      'clean beauty portrait of a young adult East-Asian woman, K-beauty glass-skin look, gentle daylight, pastel background, delicate natural makeup, serene confident expression, fashion magazine cover quality',
    weight: 10,
    preferVideo: true,
  },
  {
    key: 'girl-street-fashion',
    tags: ['girl', 'fashion', 'style', 'city'],
    prompt:
      'candid street-style photo of a stylish adult woman walking a modern city street, chic autumn coat, golden hour backlight, cinematic bokeh, effortless confident vibe, full outfit visible, tasteful and elegant',
    weight: 8,
    preferVideo: true,
  },
  {
    key: 'girl-cafe-lifestyle',
    tags: ['girl', 'style', 'life'],
    prompt:
      'lifestyle portrait of an adult woman in a cozy sunlit cafe, holding a coffee cup, warm film tones, relaxed smile, casual chic knitwear, soft window light, natural and wholesome',
    weight: 6,
  },
  {
    key: 'girl-runway-fashion',
    tags: ['fashion', 'style', 'girl'],
    prompt:
      'high fashion runway moment, adult model in an avant-garde tasteful designer gown, dramatic catwalk lighting, motion of walking, elegant poised posture, luxury couture aesthetic',
    weight: 6,
    preferVideo: true,
  },
  {
    key: 'beauty-macro-glow',
    tags: ['beauty', 'girl'],
    prompt:
      'macro beauty shot focusing on radiant healthy skin and expressive eyes of an adult woman, dewy highlight, soft rim light, luxury cosmetics campaign style, subtle golden shimmer',
    weight: 5,
  },

  // ---- nature / landscape (safe, broad appeal) ----
  {
    key: 'nature-aurora',
    tags: ['nature', 'sky', 'world'],
    prompt:
      'breathtaking aurora borealis over a mirror-still mountain lake, vivid green and violet ribbons, reflections, ultra-clear starry sky, epic wide landscape, cinematic color grade',
    weight: 5,
    preferVideo: true,
  },
  {
    key: 'nature-forest-fog',
    tags: ['nature', 'forest'],
    prompt:
      'misty ancient forest at dawn, volumetric god rays through tall pines, dewy ferns, moody atmospheric depth, hyper-detailed, serene and cinematic',
    weight: 4,
    preferVideo: true,
  },
  {
    key: 'nature-beach-sunset',
    tags: ['beach', 'nature', 'travel'],
    prompt:
      'tropical beach at golden sunset, gentle turquoise waves, palm silhouettes, warm dreamy light, glassy water reflections, relaxing cinematic travel shot',
    weight: 4,
    preferVideo: true,
  },

  // ---- animals (high shareability) ----
  {
    key: 'animals-fox-snow',
    tags: ['animals', 'nature'],
    prompt:
      'a red fox in fresh snow, crisp winter light, breath visible in cold air, sharp detailed fur, shallow depth of field, wildlife photography, adorable and majestic',
    weight: 5,
    preferVideo: true,
  },
  {
    key: 'animals-kitten',
    tags: ['animals', 'fun', 'happy'],
    prompt:
      'an adorable fluffy kitten playing with a ball of yarn, soft warm indoor light, big curious eyes, cozy blanket, heart-melting cute, crisp macro detail',
    weight: 4,
    preferVideo: true,
  },

  // ---- cars / tech / futuristic ----
  {
    key: 'cars-neon-night',
    tags: ['cars', 'city', 'futuristic'],
    prompt:
      'sleek sports car on a rain-slick neon city street at night, reflections of cyberpunk signage, cinematic low angle, motion blur, moody teal and magenta lighting',
    weight: 5,
    preferVideo: true,
  },
  {
    key: 'futuristic-city',
    tags: ['futuristic', 'city', 'tech'],
    prompt:
      'sweeping aerial view of a futuristic megacity at dusk, glowing skyscrapers, flying vehicles, layered clouds, warm sunset meeting cool neon, epic sci-fi cinematic',
    weight: 5,
    preferVideo: true,
  },
  {
    key: 'robots-portrait',
    tags: ['robots', 'tech', 'futuristic'],
    prompt:
      'highly detailed humanoid robot with brushed-metal and glass panels, soft studio lighting, reflective surfaces, intricate mechanical detail, premium product-render aesthetic',
    weight: 3,
  },
  {
    key: 'space-nebula',
    tags: ['space', 'sky'],
    prompt:
      'a vivid cosmic nebula with swirling clouds of stardust, brilliant star clusters, deep space vista, rich color, awe-inspiring astrophotography style',
    weight: 3,
    preferVideo: true,
  },

  // ---- fantasy / art ----
  {
    key: 'fantasy-dragon',
    tags: ['Fantasy', 'Artificial Intelligence'],
    prompt:
      'a majestic dragon soaring over misty mountain peaks at dawn, vast wingspan, epic scale, dramatic god rays, painterly fantasy concept-art, cinematic',
    weight: 4,
    preferVideo: true,
  },
  {
    key: 'fantasy-castle',
    tags: ['Fantasy', 'architecture'],
    prompt:
      'a floating fantasy castle above a sea of clouds at golden hour, waterfalls cascading into the sky, magical glow, richly detailed matte-painting style',
    weight: 3,
    preferVideo: true,
  },

  // ---- food (tasteful, engaging) ----
  {
    key: 'food-dessert',
    tags: ['food'],
    prompt:
      'a beautifully plated gourmet dessert, glossy chocolate and fresh berries, soft natural light, shallow depth of field, michelin-star food photography, mouthwatering detail',
    weight: 3,
  },

  // ---- sport / dance (motion-first) ----
  {
    key: 'dance-contemporary',
    tags: ['dance', 'style'],
    prompt:
      'a contemporary dancer mid-motion in a sunlit studio, flowing fabric, graceful dynamic pose, soft dust particles in light beams, elegant and expressive',
    weight: 4,
    preferVideo: true,
  },
  {
    key: 'sport-football',
    tags: ['Football', 'sport'],
    prompt:
      'dramatic football stadium moment under floodlights, player striking the ball, motion energy, cinematic crowd bokeh, epic sports photography',
    weight: 3,
    preferVideo: true,
  },
];

/** Templates whose `tags` include the given tag name (case-insensitive). */
export function templatesForTag(tagName: string): BotPromptTemplate[] {
  const lower = tagName.toLowerCase();
  return BOT_PROMPT_TEMPLATES.filter((t) =>
    t.tags.some((name) => name.toLowerCase() === lower),
  );
}

/**
 * Tag-selection weights (independent of the prompt bank now that prompts are
 * AI-written). Biased toward the highest-engagement themes; every other real
 * tag gets DEFAULT_TAG_WEIGHT so the long tail still gets seeded "a little".
 * Keys are matched case-insensitively.
 */
export const TAG_WEIGHTS: Record<string, number> = {
  girl: 10,
  fashion: 8,
  beauty: 7,
  style: 4,
  people: 3,
  animals: 4,
  nature: 4,
  cars: 3,
  futuristic: 3,
  city: 3,
  fantasy: 3,
  forest: 2,
  robots: 2,
  space: 2,
  dance: 3,
  food: 2,
  sport: 2,
  football: 2,
  love: 2,
  beach: 2,
  travel: 2,
};

export const DEFAULT_TAG_WEIGHT = 1;

/** Tags the bot never posts into (real-likeness risk / catch-all buckets). */
export const TAG_BLOCKLIST = new Set(['celebrity', 'other']);

/** Extra creative direction handed to the LLM per tag (optional). */
export const STYLE_HINTS: Record<string, string> = {
  girl: 'elegant glamour / fashion editorial; alternate Western editorial and East-Asian / K-beauty looks',
  beauty: 'clean beauty / glass-skin close-ups; alternate Western and K-beauty',
  fashion: 'high-fashion editorial and street style',
  people: 'candid lifestyle portraits of adults',
  animals: 'wildlife and adorable pets, crisp detail',
  nature: 'epic cinematic landscapes',
  cars: 'sleek automotive, neon night, cinematic',
  futuristic: 'sci-fi cityscapes and technology',
  dance: 'dynamic motion, flowing fabric',
};
