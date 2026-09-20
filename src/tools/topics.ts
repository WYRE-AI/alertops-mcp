import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getCredentials, listTopics } from '../client.js';
import type { CallToolResult } from './types.js';
import { errorResult, requireCredentials, textResult } from './shared.js';

export const TOPIC_TOOLS: Tool[] = [
  {
    name: 'alertops_list_topics',
    description: 'List all message topics configured in the AlertOps account, used to route inbound alerts to the right escalation/priority handling.',
    inputSchema: { type: 'object', properties: {} },
  },
];

const TOOL_NAMES = new Set(TOPIC_TOOLS.map((t) => t.name));
export function isTopicTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

export async function handleTopicTool(name: string, _args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'alertops_list_topics') {
      return textResult(await listTopics(creds!));
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
