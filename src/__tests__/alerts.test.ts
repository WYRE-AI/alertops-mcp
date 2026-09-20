import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleAlertTool } from '../tools/alerts.js';
import { runWithCredentials } from '../client.js';
import { jsonResponse, textOf } from './test-helpers.js';

describe('handleAlertTool', () => {
  const fetchMock = vi.fn();
  const creds = { apiKey: 'key-1' };

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('alertops_list_alerts sends the APIKey query param and forwards filters', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ alerts: [{ AlertID: 1 }] }));

    const result = await runWithCredentials(creds, () =>
      handleAlertTool('alertops_list_alerts', { alert_status: 1, limit: 25, group_list: '10,20' }),
    );

    expect(result.isError).toBeUndefined();
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/api/alert');
    expect(parsed.searchParams.get('APIKey')).toBe('key-1');
    expect(parsed.searchParams.get('AlertStatus')).toBe('1');
    expect(parsed.searchParams.get('Limit')).toBe('25');
    expect(parsed.searchParams.get('GroupList')).toBe('10,20');
    expect(JSON.parse(textOf(result)).alerts[0].AlertID).toBe(1);
  });

  it('alertops_get_alert_id_by_inbound_message_id sends messageID', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ AlertID: 49818, Status: 'Mapped Appended' }));

    const result = await runWithCredentials(creds, () =>
      handleAlertTool('alertops_get_alert_id_by_inbound_message_id', { message_id: 555 }),
    );

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/api/alert/GetAlertIDByInboundMessageID');
    expect(url.searchParams.get('messageID')).toBe('555');
    expect(result.isError).toBeUndefined();
  });

  it('alertops_get_alert_id_by_unique_inbound_id sends uniqueInboundID', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ AlertID: 49818, Status: 'Mapped Appended' }));

    const result = await runWithCredentials(creds, () =>
      handleAlertTool('alertops_get_alert_id_by_unique_inbound_id', { unique_inbound_id: 'uid-1' }),
    );

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/api/alert/GetAlertIDByUniqueInboundID');
    expect(url.searchParams.get('uniqueInboundID')).toBe('uid-1');
    expect(result.isError).toBeUndefined();
  });

  it('surfaces a 401 as a readable auth error rather than throwing', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ reason: 'Invalid API Key' }, 401));

    const result = await runWithCredentials(creds, () => handleAlertTool('alertops_list_alerts', {}));

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/rejected the API key/i);
  });

  it('returns a credential error without calling fetch when no key is configured', async () => {
    const result = await handleAlertTool('alertops_list_alerts', {});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/ALERTOPS_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
