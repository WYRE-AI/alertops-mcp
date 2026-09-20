import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getCredentials, listIntegrations } from '../client.js';
import type { CallToolResult } from './types.js';
import { errorResult, requireCredentials, textResult } from './shared.js';

export const INTEGRATION_TOOLS: Tool[] = [
  {
    name: 'alertops_list_integrations',
    description: 'List configured inbound integrations in the AlertOps account (integration rule ID -> integration type, e.g. AWS, Azure Alert, AppDynamics). Integration Rule IDs from this response are usable by alertops_list_alerts.',
    inputSchema: { type: 'object', properties: {} },
  },
];

const TOOL_NAMES = new Set(INTEGRATION_TOOLS.map((t) => t.name));
export function isIntegrationTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

export async function handleIntegrationTool(name: string, _args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'alertops_list_integrations') {
      return textResult(await listIntegrations(creds!));
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
