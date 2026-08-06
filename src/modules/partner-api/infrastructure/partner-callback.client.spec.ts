import axios from 'axios';
import { PartnerCallbackClient } from './partner-callback.client';
import { PartnerJobView } from '../application/partner-job.service';

jest.mock('axios');

describe('PartnerCallbackClient', () => {
  const post = axios.post as jest.Mock;
  let client: PartnerCallbackClient;

  const payload: PartnerJobView = {
    id: 'job_abc',
    object: 'generation',
    status: 'succeeded',
    model: 'yengine-photo',
    created: 1786312800,
    data: [{ url: 'https://ours/1.png' }],
    usage: { generation_time_ms: 1200, price_usd: 0.015 },
  };

  beforeEach(() => {
    post.mockReset();
    client = new PartnerCallbackClient();
  });

  const deliver = (url = 'https://partner.example/hook') =>
    client.deliver(url, 'delivery-1', payload);

  it('posts the job body and reports success on 2xx', async () => {
    post.mockResolvedValue({ status: 200 });

    await expect(deliver()).resolves.toMatchObject({
      delivered: true,
      httpStatus: 200,
    });
    expect(post.mock.calls[0][1]).toBe(payload);
  });

  it('names the job and the delivery so a repeat can be discarded', async () => {
    post.mockResolvedValue({ status: 204 });

    await deliver();

    expect(post.mock.calls[0][2].headers).toMatchObject({
      'X-Yallery-Event': 'generation.succeeded',
      'X-Yallery-Job-Id': 'job_abc',
      'X-Yallery-Delivery': 'delivery-1',
    });
  });

  // A validated destination that 302s into the metadata service is the whole bypass.
  it('refuses to follow redirects', async () => {
    post.mockResolvedValue({ status: 200 });

    await deliver();

    expect(post.mock.calls[0][2]).toMatchObject({ maxRedirects: 0 });
  });

  it('does not deliver to a private address', async () => {
    await expect(
      deliver('http://169.254.169.254/latest'),
    ).resolves.toMatchObject({ delivered: false });
    expect(post).not.toHaveBeenCalled();
  });

  it('treats a non-2xx as undelivered so it will be retried', async () => {
    post.mockResolvedValue({ status: 500 });

    await expect(deliver()).resolves.toMatchObject({
      delivered: false,
      httpStatus: 500,
    });
  });

  it('survives a connection failure', async () => {
    post.mockRejectedValue({ code: 'ECONNREFUSED' });

    await expect(deliver()).resolves.toMatchObject({
      delivered: false,
      error: 'ECONNREFUSED',
    });
  });
});
