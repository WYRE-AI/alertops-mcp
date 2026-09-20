import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleTopicTool } from '../tools/topics.js';
import { runWithCredentials } from '../client.js';
import { jsonResponse, textOf } from './test-helpers.js';

describe('handleTopicTool', () => {
  const fetchMock = vi.fn();
  const creds = { apiKey: 'key-1' };

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('alertops_list_topics sends the APIKey query param', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([{ MessageTopicID: 2001, MessageTopicName: 'Application Support' }]),
    );

    const result = await runWithCredentials(creds, () => handleTopicTool('alertops_list_topics', {}));

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/api/Topic/ListTopics');
    expect(url.searchParams.get('APIKey')).toBe('key-1');
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(textOf(result))[0].MessageTopicName).toBe('Application Support');
  });

  it('returns a credential error without calling fetch when no key is configured', async () => {
    const result = await handleTopicTool('alertops_list_topics', {});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/ALERTOPS_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
