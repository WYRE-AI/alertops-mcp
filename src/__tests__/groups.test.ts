import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleGroupTool } from '../tools/groups.js';
import { runWithCredentials } from '../client.js';
import { jsonResponse, textOf } from './test-helpers.js';

describe('handleGroupTool', () => {
  const fetchMock = vi.fn();
  const creds = { apiKey: 'key-1' };

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('alertops_list_groups sends the APIKey query param', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ '1000': 'Support', '1001': 'Database' }));

    const result = await runWithCredentials(creds, () => handleGroupTool('alertops_list_groups', {}));

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/api/group');
    expect(url.searchParams.get('APIKey')).toBe('key-1');
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(textOf(result))['1000']).toBe('Support');
  });

  it('returns a credential error without calling fetch when no key is configured', async () => {
    const result = await handleGroupTool('alertops_list_groups', {});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/ALERTOPS_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
