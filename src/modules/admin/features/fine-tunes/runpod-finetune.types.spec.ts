import { mapRunpodStatusToFineTuneStatus } from './runpod-finetune.types';

describe('mapRunpodStatusToFineTuneStatus', () => {
  it('maps active and terminal RunPod statuses to admin fine-tune statuses', () => {
    expect(mapRunpodStatusToFineTuneStatus('COMPLETED')).toBe('ready');
    expect(mapRunpodStatusToFineTuneStatus('IN_PROGRESS')).toBe('training');
    expect(mapRunpodStatusToFineTuneStatus('IN_QUEUE')).toBe('queued');
    expect(mapRunpodStatusToFineTuneStatus('FAILED')).toBe('failed');
    expect(mapRunpodStatusToFineTuneStatus('CANCELLED')).toBe('failed');
    expect(mapRunpodStatusToFineTuneStatus('TIMED_OUT')).toBe('failed');
  });
});
