# AlertOps MCP Server

MCP server for [AlertOps](https://alertops.com/)'s incident alerting/on-call API - alerts, message topics, users and their contact methods, groups, configured inbound integrations, and on-call schedules, for AI assistants and the WYRE Conduit gateway.

## Authentication

AlertOps' REST API (`https://api.alertops.com/api/...`, per its published OpenAPI spec at `api.alertops.com/swagger/v1/swagger.json`) authenticates with a static account-level **API key**, generated under **Account Settings -> Configurations -> Integrations -> API**. Unlike most WYRE Conduit sidecars, the key is not sent as a bearer token or custom auth header - AlertOps requires it as an **`APIKey` query-string parameter on every single request**, GET and POST alike (live-verified 2026-09-20: an invalid key returns a clean `{"reason":"Invalid API Key"}` HTTP 401 on every endpoint this connector calls). This connector receives the key per-request via a custom header (never OAuth, same shape as every other static-key WYRE Conduit sidecar) and itself appends `?APIKey=<key>` when calling AlertOps' API. In gateway mode the key arrives per-request via the `X-AlertOps-Api-Key` header; in local/stdio mode it's read once from `ALERTOPS_API_KEY`. HTTP `/mcp` also requires an `X-Gateway-S2S` signature (see HTTP authentication below). The HTTP server refuses to start without a real `CONDUIT_S2S_SECRET`.

Two separate claims here, at deliberately different confidence levels - don't collapse them into one "read-only" statement:

- **Structurally verified (checked directly, stated with full confidence):** this connector's own code makes zero calls to a write/mutating AlertOps endpoint. Every function in `client.ts` calls one of the 11 documented GET operations listed under Tools below; no `POST` call exists anywhere in `src/`.
- **Vendor-documented, not independently verified (hedged deliberately):** AlertOps ships role-based access control with built-in and custom roles built from individually-grantable read-only entitlements (e.g. `Messages_View_GlobalAccess`, `User_View_GlobalAccess`, `Groups_View_GlobalAccess`) - AlertOps' own docs describe a custom role built this way as letting a user "browse incidents, reports, users, and groups but cannot create, modify, or delete anything" (help.alertops.com, Role Based Access Control). A distinct **User API Key**, shown on a user's own Profile page, is described elsewhere in AlertOps' docs as gated by the `UserAPIKey_Add` entitlement, implying an API key issued this way inherits the issuing user's role/entitlements. **Whether that's actually enforced server-side against this connector's `APIKey` query parameter and its write endpoints specifically - i.e. whether AlertOps' backend rejects a write call (Create Alert, Close Alert, Assign, etc.) made with a key belonging to a read-only-scoped user, versus that restriction only ever being surfaced in AlertOps' own UI - has not been tested by WYRE.** Nobody sent a write call against a live key to check, correctly: that would risk creating a real page/notification against real on-call staff, not something to run without consent. **Do not read this connector, or this README, as having established that a read-only-provisioned AlertOps API key technically cannot perform writes** - only that this connector's own code never attempts one, and that AlertOps' documented role system supports provisioning a key that way.

## Configuration

Copy [`.env.example`](.env.example). Leave `CONDUIT_S2S_SECRET` empty in that file.

| Env var | Description |
|---|---|
| `ALERTOPS_API_KEY` | API key issued under Account Settings -> Configurations -> Integrations -> API. Used by stdio and by HTTP when `AUTH_MODE=env`. |
| `MCP_TRANSPORT` | `stdio` (default) or `http`. |
| `AUTH_MODE` | `env` (local default; reads `ALERTOPS_API_KEY`) or `gateway` (Docker image and Compose default). Gateway mode requires `X-AlertOps-Api-Key` on each `/mcp` request. |
| `CONDUIT_S2S_SECRET` | Required to start the HTTP transport. Empty values and known placeholders (`changeme`, `replace-with-a-real-secret`, `your-s2s-secret`, and similar) are rejected: the process logs an error and exits non-zero. The value is never logged. Compose will not start when this is unset. |
| `MCP_ALLOW_INSECURE_DEV` | Set to exactly `1` for local development only, to start HTTP when `CONDUIT_S2S_SECRET` is empty. Logs a warning, skips the `X-Gateway-S2S` check, and listens on `127.0.0.1` only. A non-loopback `MCP_HTTP_HOST` is ignored in that mode. A known placeholder secret is still rejected. |
| `MCP_HTTP_HOST` | Bind address for HTTP. Defaults to `127.0.0.1` when unset. A configured `CONDUIT_S2S_SECRET` honors this value (the container image sets `0.0.0.0`). |
| `MCP_HTTP_PORT` | HTTP port. Defaults to `8080`. |
| `LOG_LEVEL` | `debug` \| `info` (default) \| `warn` \| `error`. |

`/health` stays unauthenticated and does not read credentials. The stdio transport does not use `CONDUIT_S2S_SECRET`.

### HTTP authentication

With `MCP_TRANSPORT=http` and `CONDUIT_S2S_SECRET` set, every `/mcp` request must include `X-Gateway-S2S`. The value is:

```text
t=<unix seconds>,v1=<hex hmac-sha256>
```

`v1` is HMAC-SHA256 over the ASCII message `t=<unix seconds>` (the same `t=` prefix that appears in the header), keyed by `CONDUIT_S2S_SECRET`, encoded as 64 lowercase hex characters. A missing or invalid header returns 401. The secret is never logged.

In `AUTH_MODE=gateway`, `/mcp` also requires `X-AlertOps-Api-Key`. A request missing that header returns 401. Gateway mode uses that header as the only AlertOps credential for the request.

### Request limits

- HTTP request bodies are capped at 256 KiB (262144 bytes). After the `X-Gateway-S2S` check passes, a `Content-Length` above the cap returns 413 with a JSON-RPC error; bodies without `Content-Length` are capped by the MCP SDK transport. Unauthenticated requests still get 401 first.
- `tools/call` arguments are capped at 10,000 elements (every array item and object key at any depth). Larger inputs return an `isError` tool result and are never dispatched.

These limits address CVE-2026-111768 / GHSA-46jr-4wx8-v453 (memory exhaustion during validation) and GHSA-f897-62hf-6gxq (no request body / batch cap).

## Tools

11 read-only tools, one per GET operation in AlertOps' published REST API spec (25 operations total; the other 14 are POST/write and are deliberately excluded - see Scope below).

### Alerts
- `alertops_list_alerts` - list alerts, filterable by status/date range/group/integration/escalation, paginated.
- `alertops_get_alert_id_by_inbound_message_id` - resolve the AlertID an inbound integration's messageID was mapped to.
- `alertops_get_alert_id_by_unique_inbound_id` - resolve the AlertID an inbound integration's uniqueInboundID was mapped to.

### Users
- `alertops_list_users` - list users (username, full name, user type).
- `alertops_get_user_contact_methods` - list a user's configured contact methods (email, phone/SMS). Contact PII.

### Groups
- `alertops_list_groups` - list groups (group ID -> group name).

### Topics
- `alertops_list_topics` - list message topics used for alert routing/escalation.

### Integrations
- `alertops_list_integrations` - list configured inbound integrations (integration rule ID -> integration type).

### Schedule
- `alertops_get_oncall_now` - list who is on-call right now, for every group or one specific group.
- `alertops_get_user_schedule` - a user's on-call schedule for a date range (max 3 months).
- `alertops_get_group_schedule` - a group's on-call schedule for a date range (max 3 months).

## Scope

**This is a deliberately narrow, read-only v1 surface, hard-scoped to exactly 11 of AlertOps' 25 documented operations.** AlertOps is a live incident-paging system - every excluded operation either mutates state or can trigger a real page/notification to a human, so none of it is implemented here, by design, not by oversight:

**Hard-excluded (creates or mutates a live alert - can page a human) - never implemented:**
- `POST /api/alert/Create` (`Alert_Create`) - creates a new alert, which pages/notifies its recipients.
- `POST /api/alert/Close` (`Alert_Close`) - closes a live alert.
- `POST /api/alert/Update` (`Alert_Update`) - updates a field on a live alert.
- `POST /api/alert/Assign` (`Alert_Assign`) - assigns a user to an alert.
- `POST /api/alert/Note` (`Alert_Note`) - adds a note to an alert.
- `POST /api/alert/AddRecipients` (`Alert_AddRecipients`) - adds recipients to an alert, i.e. pages additional people.
- `POST /api/alert/Reply` (`Alert_Reply`) - replies to an alert.

**Hard-excluded (provisioning/mutation - users, groups, schedules, integrations) - never implemented:**
- `POST /api/user/CreateUser` (`User_CreateUser`) - creates a new user.
- `POST /api/user/CreateOutOfOffice` (`User_CreateOutOfOffice`) - creates an out-of-office record, which changes who gets paged.
- `POST /api/group/CreateGroup` (`Group_CreateGroup`) - creates a new group.
- `POST /api/group/AddGroupMember` (`Group_AddGroupMember`) - adds a member to a group, which changes who gets paged.
- `POST /api/schedule/CreateFixedSchedule` (`Schedule_CreateFixedSchedule`) - creates a fixed on-call schedule.
- `POST /api/schedule/CreateRecurringSchedule` (`Schedule_CreateRecurringSchedule`) - creates a recurring on-call schedule.
- `POST /api/integration/CreateMaintenanceWindows` (`Integration_CreateMaintenanceWindows`) - creates a maintenance window, which suppresses alerting.

They can be added as a follow-up if there's demand, after a deliberate scope decision - not by default.

## Development

```bash
npm install
npm run build
npm test
npm run lint   # tsc --noEmit
```

## Docker

The image listens on `0.0.0.0` inside the container (`MCP_HTTP_HOST`) and defaults to `AUTH_MODE=gateway`. Publish the port on loopback and pass a generated S2S secret. Startup rejects an empty `CONDUIT_S2S_SECRET` and known placeholders (`your-s2s-secret`, `changeme`, and similar), so each command below creates a value with `openssl rand -hex 32` instead of embedding one. In gateway mode the AlertOps API key arrives on each request as `X-AlertOps-Api-Key`.

```bash
docker build -t alertops-mcp .
docker run \
  -e CONDUIT_S2S_SECRET="$(openssl rand -hex 32)" \
  -p 127.0.0.1:8080:8080 \
  alertops-mcp
```

Compose refuses to start when `CONDUIT_S2S_SECRET` is unset. The Compose service is gateway mode, sets no `ALERTOPS_API_KEY`, and publishes `127.0.0.1:8080:8080`. Export one secret when a gateway must sign requests with the same value the container receives:

```bash
export CONDUIT_S2S_SECRET="$(openssl rand -hex 32)"
docker compose up
```

Single-tenant HTTP (`AUTH_MODE=env`) still requires the S2S secret, then uses `ALERTOPS_API_KEY` from the environment. Export that key before running the command.

```bash
docker run \
  -e CONDUIT_S2S_SECRET="$(openssl rand -hex 32)" \
  -e AUTH_MODE=env \
  -e ALERTOPS_API_KEY \
  -p 127.0.0.1:8080:8080 \
  alertops-mcp
```

Local HTTP without a secret is development-only. It binds `127.0.0.1` even if `MCP_HTTP_HOST` is `0.0.0.0`, and logs a warning:

```bash
MCP_TRANSPORT=http MCP_ALLOW_INSECURE_DEV=1 npm run start:http
```

## License

Apache-2.0
