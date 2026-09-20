/**
 * AlertOps authenticates its REST API with a static account-level API key,
 * generated under Account Settings -> Configurations -> Integrations ->
 * API. Unlike most other WYRE Conduit sidecars, the key is NOT sent as a
 * bearer token / custom header - AlertOps' own OpenAPI spec
 * (api.alertops.com/swagger/v1/swagger.json) requires it as an `APIKey`
 * query-string parameter on every single request, GET and POST alike. This
 * connector receives the key per-request via a custom header (never OAuth,
 * same shape as every other static-key WYRE Conduit sidecar) and itself
 * appends `?APIKey=<key>` (plus any other query params) when calling
 * AlertOps' API. See README's Authentication section for the read-only
 * scoping confidence split.
 */
export interface AlertOpsCredentials {
  apiKey: string;
}

/** Thrown when AlertOps rejects the API key (HTTP 401) - distinct from other failures so callers get an honest error. */
export class AlertOpsAuthError extends Error {}

/** Thrown when AlertOps rate-limits the request (HTTP 429) - distinct from an auth failure. */
export class AlertOpsRateLimitError extends Error {}

/** Thrown for any other non-2xx / unexpected vendor response. */
export class AlertOpsApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------

/** AlertStatus filter values documented by GET /api/alert: Open=1, Closed=2, Assigned=5, All=0. */
export type AlertStatusFilter = 0 | 1 | 2 | 5;

export interface ListAlertsParams {
  limit?: number;
  offset?: number;
  alertStatus?: AlertStatusFilter;
  dateFrom?: string;
  dateTo?: string;
  order?: 'asc' | 'desc';
  alertId?: number;
  closedFromDate?: string;
  closedToDate?: string;
  groupList?: string;
  integrationList?: string;
  escalationList?: string;
}

export interface GetAlertIdByInboundMessageIdParams {
  messageId: number;
}

export interface GetAlertIdByUniqueInboundIdParams {
  uniqueInboundId: string;
}

// ---------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------

export interface GetUserContactMethodsParams {
  userName: string;
}

// ---------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------

export interface GetOncallNowParams {
  groupId?: number;
}

export interface GetUserScheduleParams {
  /** Date format 'mm/dd/yyyy'. */
  startDate: string;
  /** Date format 'mm/dd/yyyy'. */
  endDate: string;
  userName: string;
}

export interface GetGroupScheduleParams {
  /** Date format 'mm/dd/yyyy'. */
  startDate: string;
  /** Date format 'mm/dd/yyyy'. */
  endDate: string;
  groupId: number;
}
