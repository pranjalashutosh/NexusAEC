import { createApp } from '../app';

describe('GET /health', () => {
  it('should return ok=true', async () => {
    const app = await createApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(payload.ok).toBe(true);
    expect(typeof payload.timestamp).toBe('string');

    await app.close();
  });
});
