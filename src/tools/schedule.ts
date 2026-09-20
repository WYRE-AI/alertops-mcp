import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getCredentials, getGroupSchedule, getOncallNow, getUserSchedule } from '../client.js';
import type { CallToolResult } from './types.js';
import { errorResult, requireCredentials, textResult } from './shared.js';

export const SCHEDULE_TOOLS: Tool[] = [
  {
    name: 'alertops_get_oncall_now',
    description: 'List who is on-call right now, for every group or (optionally) a single group. Returns each group and its current on-call member(s).',
    inputSchema: {
      type: 'object',
      properties: {
        group_id: { type: 'number', description: 'Optional. Limit to this Group ID, from alertops_list_groups. Omit to return every group.' },
      },
    },
  },
  {
    name: 'alertops_get_user_schedule',
    description: "List a specific user's on-call schedule for a date range (max duration 3 months). Requires a username from alertops_list_users.",
    inputSchema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: "Start date, format 'mm/dd/yyyy'." },
        end_date: { type: 'string', description: "End date, format 'mm/dd/yyyy'." },
        user_name: { type: 'string', description: 'Username, from alertops_list_users.' },
      },
      required: ['start_date', 'end_date', 'user_name'],
    },
  },
  {
    name: 'alertops_get_group_schedule',
    description: "List a group's on-call schedule for a date range (max duration 3 months). Requires a Group ID from alertops_list_groups.",
    inputSchema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: "Start date, format 'mm/dd/yyyy'." },
        end_date: { type: 'string', description: "End date, format 'mm/dd/yyyy'." },
        group_id: { type: 'number', description: 'Group ID, from alertops_list_groups.' },
      },
      required: ['start_date', 'end_date', 'group_id'],
    },
  },
];

const TOOL_NAMES = new Set(SCHEDULE_TOOLS.map((t) => t.name));
export function isScheduleTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

export async function handleScheduleTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'alertops_get_oncall_now') {
      return textResult(await getOncallNow(creds!, { groupId: args.group_id as number | undefined }));
    }

    if (name === 'alertops_get_user_schedule') {
      return textResult(
        await getUserSchedule(creds!, {
          startDate: args.start_date as string,
          endDate: args.end_date as string,
          userName: args.user_name as string,
        }),
      );
    }

    if (name === 'alertops_get_group_schedule') {
      return textResult(
        await getGroupSchedule(creds!, {
          startDate: args.start_date as string,
          endDate: args.end_date as string,
          groupId: args.group_id as number,
        }),
      );
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
