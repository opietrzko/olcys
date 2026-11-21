import { describe, expect, it } from 'vitest';
import { withRetry } from '../src/http';

const ok = (status = 200) => new Response('x', { status });
const dropped = () => Object.assign(new TypeError('fetch failed'), { name: 'TypeError' });

describe('withRetry', () => {
  it('retries a GET after a dropped connection and returns the later success', async () => {
    let calls = 0;
    const res = await withRetry('GET', async () => (++calls < 3 ? Promise.reject(dropped()) : ok()), [0, 0]);
    expect(res.status).toBe(200);
    expect(calls).toBe(3);
  });

  it('retries 503 but returns 429 and 404 at once', async () => {
    let calls = 0;
    expect((await withRetry('GET', async () => (++calls === 1 ? ok(503) : ok()), [0, 0])).status).toBe(200);
    for (const status of [429, 404]) {
      calls = 0;
      expect((await withRetry('GET', async () => (calls++, ok(status)), [0, 0])).status).toBe(status);
      expect(calls).toBe(1);
    }
  });

  it('never repeats a POST or a timed-out request', async () => {
    let calls = 0;
    await expect(withRetry('POST', async () => (calls++, Promise.reject(dropped())), [0, 0])).rejects.toThrow('fetch failed');
    expect(calls).toBe(1);
    calls = 0;
    const timeout = Object.assign(new Error('timeout'), { name: 'TimeoutError' });
    await expect(withRetry('GET', async () => (calls++, Promise.reject(timeout)), [0, 0])).rejects.toThrow('timeout');
    expect(calls).toBe(1);
  });

  it('gives up after the last delay', async () => {
    let calls = 0;
    await expect(withRetry('GET', async () => (calls++, Promise.reject(dropped())), [0, 0])).rejects.toThrow('fetch failed');
    expect(calls).toBe(3);
  });
});
