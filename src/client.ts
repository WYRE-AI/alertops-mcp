import { AsyncLocalStorage } from 'node:async_hooks';
import { logger } from './utils/logger.js';
import { AlertOpsApiError, AlertOpsAuthError, AlertOpsRateLimitError } from './types.js';
import type {
  AlertOpsCredentials,
  GetAlertIdByInboundMessageIdParams,
  GetAlertIdByUniqueInboundIdParams,
  GetGroupScheduleParams,
  GetOncallNowParams,
  GetUserContactMethodsParams,
  GetUserScheduleParams,
  ListAlertsParams,
} from './types.js';

// Verified live against the vendor 2026-09-20: `https://api.alertops.com/api/...`
// returns a clean `{"reason":"Invalid API Key"}` 401 for every path below.
// AlertOps' OpenAPI spec (api.alertops.com/swagger/v1/swagger.json) embeds
// this same `/api/...` prefix in every documented path - there is no `/v1/`
// segment on this API, despite that being how it's sometimes described.
export const BASE_URL = 'https://api.alertops.com/api';

// Request-scoped credential store. In gateway mode the HTTP layer runs each
// request inside runWithCredentials({apiKey}); getCredentials() reads from
// it. Falls back to process.env for stdio/single-tenant mode.
const credStore = new AsyncLocalStorage<AlertOpsCredentials>();

export function runWithCredentials<T>(creds: AlertOpsCredentials, fn: () => T): T {
  return credStore.run(creds, fn);
}

export function getCredentials(): AlertOpsCredentials | null {
  const scoped = credStore.getStore();
  if (scoped?.apiKey) return scoped;
  const apiKey = process.env.ALERTOPS_API_KEY;
  if (!apiKey) {
    logger.warn('Missing credentials', { hasApiKey: !!apiKey });
    return null;
  }
  return { apiKey };
}

function buildQuery(creds: AlertOpsCredentials, params: Record<string, unknown> = {}): URLSearchParams {
  // APIKey is a REQUIRED query parameter on every AlertOps REST call (not a
  // header) - see the note on BASE_URL and README's Authentication section.
  const qs = new URLSearchParams();
  qs.append('APIKey', creds.apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    qs.append(key, String(value));
  }
  return qs;
}

async function doGet<T>(
  creds: AlertOpsCredentials,
  path: string,
  query?: Record<string, unknown>,
): Promise<T> {
  const qs = buildQuery(creds, query).toString();
  const url = `${BASE_URL}${path}?${qs}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });

  // 401 (invalid/revoked API key) and 429 (rate-limited) are distinct
  // failure modes with distinct remediations - grouping them under one
  // generic auth-error class hides a transient rate limit behind a message
  // that reads like a bad/expired key.
  if (res.status === 401) {
    throw new AlertOpsAuthError(`AlertOps rejected the API key (HTTP 401): ${path}`);
  }
  if (res.status === 429) {
    throw new AlertOpsRateLimitError(`AlertOps rate-limited the request (HTTP 429): ${path}`);
  }
  if (!res.ok) {
    throw new AlertOpsApiError(`AlertOps ${path} failed: HTTP ${res.status}`, res.status);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------

/** GET /api/alert - list alerts, paginated and filterable by status/date/group/integration/escalation. */
export async function listAlerts(creds: AlertOpsCredentials, params: ListAlertsParams = {}): Promise<unknown> {
  return doGet(creds, '/alert', {
    Limit: params.limit,
    Offset: params.offset,
    AlertStatus: params.alertStatus,
    DateFrom: params.dateFrom,
    DateTo: params.dateTo,
    Order: params.order,
    AlertID: params.alertId,
    ClosedFromDate: params.closedFromDate,
    ClosedToDate: params.closedToDate,
    GroupList: params.groupList,
    IntegrationList: params.integrationList,
    EscalationList: params.escalationList,
  });
}

/** GET /api/alert/GetAlertIDByInboundMessageID - resolve the AlertID an inbound integration message was mapped/appended to. */
export async function getAlertIdByInboundMessageId(
  creds: AlertOpsCredentials,
  { messageId }: GetAlertIdByInboundMessageIdParams,
): Promise<unknown> {
  return doGet(creds, '/alert/GetAlertIDByInboundMessageID', { messageID: messageId });
}

/** GET /api/alert/GetAlertIDByUniqueInboundID - resolve the AlertID an inbound integration's unique InboundID was mapped/appended to. */
export async function getAlertIdByUniqueInboundId(
  creds: AlertOpsCredentials,
  { uniqueInboundId }: GetAlertIdByUniqueInboundIdParams,
): Promise<unknown> {
  return doGet(creds, '/alert/GetAlertIDByUniqueInboundID', { uniqueInboundID: uniqueInboundId });
}

// ---------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------

/** GET /api/user/ListUsers - list users (username, full name, user type). */
export async function listUsers(creds: AlertOpsCredentials): Promise<unknown> {
  return doGet(creds, '/user/ListUsers');
}

/** GET /api/user/GetUserContactMethods - list a user's configured contact methods (email, phone, etc). PII. */
export async function getUserContactMethods(
  creds: AlertOpsCredentials,
  { userName }: GetUserContactMethodsParams,
): Promise<unknown> {
  return doGet(creds, '/user/GetUserContactMethods', { UserName: userName });
}

// ---------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------

/** GET /api/group - list groups (group ID -> group name). */
export async function listGroups(creds: AlertOpsCredentials): Promise<unknown> {
  return doGet(creds, '/group');
}

// ---------------------------------------------------------------------
// Topics
// ---------------------------------------------------------------------

/** GET /api/Topic/ListTopics - list message topics used for alert routing/escalation. */
export async function listTopics(creds: AlertOpsCredentials): Promise<unknown> {
  return doGet(creds, '/Topic/ListTopics');
}

// ---------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------

/** GET /api/integration - list configured inbound integrations (integration rule ID -> integration type). */
export async function listIntegrations(creds: AlertOpsCredentials): Promise<unknown> {
  return doGet(creds, '/integration');
}

// ---------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------

/** GET /api/schedule/Oncallnow - list who is on-call right now, optionally scoped to one group. */
export async function getOncallNow(creds: AlertOpsCredentials, params: GetOncallNowParams = {}): Promise<unknown> {
  return doGet(creds, '/schedule/Oncallnow', { GroupID: params.groupId });
}

/** GET /api/schedule/GetUserSchedule - a user's on-call schedule for a date range (max 3 months). */
export async function getUserSchedule(
  creds: AlertOpsCredentials,
  { startDate, endDate, userName }: GetUserScheduleParams,
): Promise<unknown> {
  return doGet(creds, '/schedule/GetUserSchedule', { startDate, endDate, userName });
}

/** GET /api/schedule/GetGroupSchedule - a group's on-call schedule for a date range (max 3 months). */
export async function getGroupSchedule(
  creds: AlertOpsCredentials,
  { startDate, endDate, groupId }: GetGroupScheduleParams,
): Promise<unknown> {
  return doGet(creds, '/schedule/GetGroupSchedule', { startDate, endDate, groupID: groupId });
}
