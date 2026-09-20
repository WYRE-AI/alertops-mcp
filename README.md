# AlertOps MCP Server

MCP server for [AlertOps](https://alertops.com/)'s incident alerting/on-call API - alerts, message topics, users and their contact methods, groups, configured inbound integrations, and on-call schedules, for AI assistants and the WYRE Conduit gateway.

## Authentication

AlertOps' REST API (`https://api.alertops.com/api/...`, per its published OpenAPI spec at `api.alertops.com/swagger/v1/swagger.json`) authenticates with a static account-level **API key**, generated under **Account Settings -> Configurations -> Integrations -> API**. Unlike most WYRE Conduit sidecars, the key is not sent as a bearer token or custom auth header - AlertOps requires it as an **`APIKey` query-string parameter on every single request**, GET and POST alike (live-verified 2026-09-20: an invalid key returns a clean `{"reason":"Invalid API Key"}` HTTP 401 on every endpoint this connector calls). This connector receives the key per-request via a custom header (never OAuth, same shape as every other static-key WYRE Conduit sidecar) and itself appends `?APIKey=<key>` when calling AlertOps' API. In gateway mode the key arrives per-request via the `X-AlertOps-Api-Key` header; in local/stdio mode it's read once from `ALERTOPS_API_KEY`.

Two separate claims here, at deliberately different confidence levels - don't collapse them into one "read-only" statement:

- **Structurally verified (checked directly, stated with full confidence):** this connector's own code makes zero calls to a write/mutating AlertOps endpoint. Every function in `client.ts` calls one of the 11 documented GET operations listed under Tools below; no `POST` call exists anywhere in `src/`.
- **Vendor-documented, not independently verified (hedged deliberately):** AlertOps ships role-based access control with built-in and custom roles built from individually-grantable read-only entitlements (e.g. `Messages_View_GlobalAccess`, `User_View_GlobalAccess`, `Groups_View_GlobalAccess`) - AlertOps' own docs describe a custom role built this way as letting a user "browse incidents, reports, users, and groups but cannot create, modify, or delete anything" (help.alertops.com, Role Based Access Control). A distinct **User API Key**, shown on a user's own Profile page, is described elsewhere in AlertOps' docs as gated by the `UserAPIKey_Add` entitlement, implying an API key issued this way inherits the issuing user's role/entitlements. **Whether that's actually enforced server-side against this connector's `APIKey` query parameter and its write endpoints specifically - i.e. whether AlertOps' backend rejects a write call (Create Alert, Close Alert, Assign, etc.) made with a key belonging to a read-only-scoped user, versus that restriction only ever being surfaced in AlertOps' own UI - has not been tested by WYRE.** Nobody sent a write call against a live key to check, correctly: that would risk creating a real page/notification against real on-call staff, not something to run without consent. **Do not read this connector, or this README, as having established that a read-only-provisioned AlertOps API key technically cannot perform writes** - only that this connector's own code never attempts one, and that AlertOps' documented role system supports provisioning a key that way.

## Configuration

| Env var | Description |
|---|---|
| `ALERTOPS_API_KEY` | API key issued under Account Settings -> Configurations -> Integrations -> API. |
| `MCP_TRANSPORT` | `stdio` (default) or `http`. |
| `AUTH_MODE` | `env` (default, reads the var above) or `gateway` (credential arrives per-request via the `X-AlertOps-Api-Key` header, injected by the Conduit gateway). |
| `CONDUIT_S2S_SECRET` | When set, the HTTP transport requires a valid `X-Gateway-S2S` header (Conduit sidecar auth) on every `/mcp` request. |
| `LOG_LEVEL` | `debug` \| `info` (default) \| `warn` \| `error`. |

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

```bash
docker build -t alertops-mcp .
docker run -p 8080:8080 -e ALERTOPS_API_KEY=... alertops-mcp
```

## License

Apache-2.0
