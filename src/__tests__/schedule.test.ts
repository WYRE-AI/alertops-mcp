import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleScheduleTool } from '../tools/schedule.js';
import { runWithCredentials } from '../client.js';
import { jsonResponse, textOf } from './test-helpers.js';

describe('handleScheduleTool', () => {
  const fetchMock = vi.fn();
  const creds = { apiKey: 'key-1' };

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('alertops_get_oncall_now sends the APIKey query param and an optional GroupID', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([{ GroupID: 1956, GroupName: 'Email Group' }]));

    const result = await runWithCredentials(creds, () =>
      handleScheduleTool('alertops_get_oncall_now', { group_id: 1956 }),
    );

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/api/schedule/Oncallnow');
    expect(url.searchParams.get('APIKey')).toBe('key-1');
    expect(url.searchParams.get('GroupID')).toBe('1956');
    expect(result.isError).toBeUndefined();
  });

  it('alertops_get_oncall_now omits GroupID when not supplied', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));

    await runWithCredentials(creds, () => handleScheduleTool('alertops_get_oncall_now', {}));

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.has('GroupID')).toBe(false);
  });

  it('alertops_get_user_schedule sends startDate/endDate/userName', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([{ StartDateTime: '2026-01-01T00:00:00-06:00' }]));

    const result = await runWithCredentials(creds, () =>
      handleScheduleTool('alertops_get_user_schedule', {
        start_date: '01/01/2026',
        end_date: '01/31/2026',
        user_name: 'testOne',
      }),
    );

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/api/schedule/GetUserSchedule');
    expect(url.searchParams.get('startDate')).toBe('01/01/2026');
    expect(url.searchParams.get('endDate')).toBe('01/31/2026');
    expect(url.searchParams.get('userName')).toBe('testOne');
    expect(result.isError).toBeUndefined();
  });

  it('alertops_get_group_schedule sends startDate/endDate/groupID', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([{ GroupID: 1956 }]));

    const result = await runWithCredentials(creds, () =>
      handleScheduleTool('alertops_get_group_schedule', {
        start_date: '01/01/2026',
        end_date: '01/31/2026',
        group_id: 1956,
      }),
    );

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/api/schedule/GetGroupSchedule');
    expect(url.searchParams.get('startDate')).toBe('01/01/2026');
    expect(url.searchParams.get('endDate')).toBe('01/31/2026');
    expect(url.searchParams.get('groupID')).toBe('1956');
    expect(result.isError).toBeUndefined();
  });

  it('surfaces a 401 as a readable auth error rather than throwing', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ reason: 'Invalid API Key' }, 401));

    const result = await runWithCredentials(creds, () => handleScheduleTool('alertops_get_oncall_now', {}));

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/rejected the API key/i);
  });

  it('returns a credential error without calling fetch when no key is configured', async () => {
    const result = await handleScheduleTool('alertops_get_oncall_now', {});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/ALERTOPS_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
