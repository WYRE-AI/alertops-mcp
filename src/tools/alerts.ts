import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getAlertIdByInboundMessageId, getAlertIdByUniqueInboundId, getCredentials, listAlerts } from '../client.js';
import type { CallToolResult } from './types.js';
import { errorResult, requireCredentials, textResult } from './shared.js';

export const ALERT_TOOLS: Tool[] = [
  {
    name: 'alertops_list_alerts',
    description:
      "List alerts, newest first by default. Filter by status (open/closed/assigned/all), a date range (created or closed), a specific AlertID, or by group/integration/escalation-rule IDs. Paginated (Limit, max 100 per page; Offset). AlertIDs from this response are usable directly; message-level lookups (by inbound integration's messageID or uniqueInboundID) are separate tools.",
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Page size. Default 10, max 100.' },
        offset: { type: 'number', description: 'Starting point for the result set. Default 0.' },
        alert_status: {
          type: 'number',
          description: 'Open=1, Closed=2, Assigned=5, All=0. Default 0 (all).',
          enum: [0, 1, 2, 5],
        },
        date_from: { type: 'string', description: "Created-date lower bound, format 'yyyy-mm-dd'." },
        date_to: { type: 'string', description: "Created-date upper bound, format 'yyyy-mm-dd'." },
        order: { type: 'string', description: "'desc' (default) or 'asc', by created date." },
        alert_id: { type: 'number', description: 'Return only this AlertID.' },
        closed_from_date: { type: 'string', description: "Closed-date lower bound, format 'yyyy-mm-dd'." },
        closed_to_date: { type: 'string', description: "Closed-date upper bound, format 'yyyy-mm-dd'." },
        group_list: { type: 'string', description: 'Comma-separated Group IDs to filter by, e.g. "123,456". From alertops_list_groups.' },
        integration_list: { type: 'string', description: 'Comma-separated Integration Rule IDs to filter by, e.g. "123,456". From alertops_list_integrations.' },
        escalation_list: { type: 'string', description: 'Comma-separated Escalation Rule IDs to filter by, e.g. "123,456".' },
      },
    },
  },
  {
    name: 'alertops_get_alert_id_by_inbound_message_id',
    description: "Resolve the AlertID that a given inbound integration messageID was mapped or appended to. The messageID is the value an inbound integration call returns, not the AlertID itself.",
    inputSchema: {
      type: 'object',
      properties: {
        message_id: { type: 'number', description: 'The messageID returned by an inbound integration call.' },
      },
      required: ['message_id'],
    },
  },
  {
    name: 'alertops_get_alert_id_by_unique_inbound_id',
    description: "Resolve the AlertID that a given inbound integration's uniqueInboundID was mapped or appended to. The uniqueInboundID is the value an inbound integration call returns, not the AlertID itself.",
    inputSchema: {
      type: 'object',
      properties: {
        unique_inbound_id: { type: 'string', description: 'The uniqueInboundID returned by an inbound integration call.' },
      },
      required: ['unique_inbound_id'],
    },
  },
];

const TOOL_NAMES = new Set(ALERT_TOOLS.map((t) => t.name));
export function isAlertTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

export async function handleAlertTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'alertops_list_alerts') {
      return textResult(
        await listAlerts(creds!, {
          limit: args.limit as number | undefined,
          offset: args.offset as number | undefined,
          alertStatus: args.alert_status as 0 | 1 | 2 | 5 | undefined,
          dateFrom: args.date_from as string | undefined,
          dateTo: args.date_to as string | undefined,
          order: args.order as 'asc' | 'desc' | undefined,
          alertId: args.alert_id as number | undefined,
          closedFromDate: args.closed_from_date as string | undefined,
          closedToDate: args.closed_to_date as string | undefined,
          groupList: args.group_list as string | undefined,
          integrationList: args.integration_list as string | undefined,
          escalationList: args.escalation_list as string | undefined,
        }),
      );
    }

    if (name === 'alertops_get_alert_id_by_inbound_message_id') {
      return textResult(
        await getAlertIdByInboundMessageId(creds!, { messageId: args.message_id as number }),
      );
    }

    if (name === 'alertops_get_alert_id_by_unique_inbound_id') {
      return textResult(
        await getAlertIdByUniqueInboundId(creds!, { uniqueInboundId: args.unique_inbound_id as string }),
      );
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
