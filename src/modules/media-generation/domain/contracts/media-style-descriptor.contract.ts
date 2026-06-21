/**
 * Structured style descriptor the backend passes to a worker. The worker's in-worker prompt
 * upsampler weaves these into the model's preferred prompt format. The backend no longer composes
 * prompts itself.
 */
export interface MediaStyleDescriptor {
  name: string | null;
  positive: string | null;
  negative: string | null;
  keywords: string[] | null;
}
