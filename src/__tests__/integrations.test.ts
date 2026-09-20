import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleIntegrationTool } from '../tools/integrations.js';
import { runWithCredentials } from '../client.js';
import { jsonResponse, textOf } from './test-helpers.js';

describe('handleIntegrationTool', () => {
  const fetchMock = vi.fn();
  const creds = { apiKey: 'key-1' };

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('alertops_list_integrations sends the APIKey query param', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ '1800': 'AppDynamics', '1801': 'AWS' }));

    const result = await runWithCredentials(creds, () =>
      handleIntegrationTool('alertops_list_integrations', {}),
    );

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/api/integration');
    expect(url.searchParams.get('APIKey')).toBe('key-1');
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(textOf(result))['1800']).toBe('AppDynamics');
  });

  it('returns a credential error without calling fetch when no key is configured', async () => {
    const result = await handleIntegrationTool('alertops_list_integrations', {});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/ALERTOPS_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
