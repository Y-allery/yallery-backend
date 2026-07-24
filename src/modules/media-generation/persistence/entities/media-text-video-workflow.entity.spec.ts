import { getMetadataArgsStorage } from 'typeorm';
import { MediaTextVideoWorkflowEntity } from './media-text-video-workflow.entity';

describe('MediaTextVideoWorkflowEntity persistence contract', () => {
  const metadata = getMetadataArgsStorage();
  const columns = metadata.columns
    .filter((column) => column.target === MediaTextVideoWorkflowEntity)
    .map((column) => column.propertyName);
  const indices = metadata.indices.filter(
    (index) => index.target === MediaTextVideoWorkflowEntity,
  );

  it('stores hashes and opaque references but no raw prompts, URLs or bodies', () => {
    expect(columns).toEqual(
      expect.arrayContaining([
        'rawPromptSha256',
        'stillPromptSha256',
        'motionPromptSha256',
        'prunaClientPolicySha256',
        'stillRequestSha256',
        'i2vRequestSha256',
        'privateArtifactRef',
      ]),
    );
    expect(columns).not.toEqual(
      expect.arrayContaining([
        'prompt',
        'stillPrompt',
        'motionPrompt',
        'apiKey',
        'generationUrl',
        'getUrl',
        'outputUrl',
        'base64',
        'providerResponse',
        'rawResponse',
      ]),
    );
  });

  it('has the CAS version and unique adoption identities', () => {
    expect(columns).toContain('version');
    const uniqueIndices = indices
      .filter((index) => index.unique)
      .map((index) => index.columns)
      .filter(Array.isArray);
    expect(uniqueIndices).toEqual(
      expect.arrayContaining([
        ['taskId'],
        ['providerPredictionId'],
        ['runpodJobId'],
        ['finalPostId'],
      ]),
    );
  });
});
