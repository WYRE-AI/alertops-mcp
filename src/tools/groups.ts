import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getCredentials, listGroups } from '../client.js';
import type { CallToolResult } from './types.js';
import { errorResult, requireCredentials, textResult } from './shared.js';

export const GROUP_TOOLS: Tool[] = [
  {
    name: 'alertops_list_groups',
    description: 'List all groups in the AlertOps account (group ID -> group name). Group IDs from this response are usable by alertops_list_alerts, alertops_get_oncall_now, and alertops_get_group_schedule.',
    inputSchema: { type: 'object', properties: {} },
  },
];

const TOOL_NAMES = new Set(GROUP_TOOLS.map((t) => t.name));
export function isGroupTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

export async function handleGroupTool(name: string, _args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'alertops_list_groups') {
      return textResult(await listGroups(creds!));
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
