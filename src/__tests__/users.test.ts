import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleUserTool } from '../tools/users.js';
import { runWithCredentials } from '../client.js';
import { jsonResponse, textOf } from './test-helpers.js';

describe('handleUserTool', () => {
  const fetchMock = vi.fn();
  const creds = { apiKey: 'key-1' };

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('alertops_list_users sends the APIKey query param', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([{ UserName: 'testOne', FullName: 'One, Test' }]));

    const result = await runWithCredentials(creds, () => handleUserTool('alertops_list_users', {}));

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/api/user/ListUsers');
    expect(url.searchParams.get('APIKey')).toBe('key-1');
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(textOf(result))[0].UserName).toBe('testOne');
  });

  it('alertops_get_user_contact_methods requires and forwards UserName', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([{ ContactType: 'Email-Official' }]));

    const result = await runWithCredentials(creds, () =>
      handleUserTool('alertops_get_user_contact_methods', { user_name: 'testOne' }),
    );

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/api/user/GetUserContactMethods');
    expect(url.searchParams.get('UserName')).toBe('testOne');
    expect(result.isError).toBeUndefined();
  });

  it('surfaces a 401 as a readable auth error rather than throwing', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ reason: 'Invalid API Key' }, 401));

    const result = await runWithCredentials(creds, () => handleUserTool('alertops_list_users', {}));

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/rejected the API key/i);
  });

  it('returns a credential error without calling fetch when no key is configured', async () => {
    const result = await handleUserTool('alertops_list_users', {});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/ALERTOPS_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
