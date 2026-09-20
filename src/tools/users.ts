import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getCredentials, getUserContactMethods, listUsers } from '../client.js';
import type { CallToolResult } from './types.js';
import { errorResult, requireCredentials, textResult } from './shared.js';

export const USER_TOOLS: Tool[] = [
  {
    name: 'alertops_list_users',
    description: 'List all users in the AlertOps account (username, full name, user type). Usernames from this response are required by alertops_get_user_contact_methods and alertops_get_user_schedule.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'alertops_get_user_contact_methods',
    description: "List a user's configured contact methods (email, phone/SMS, etc), including whether each is enabled. Contains contact PII. Requires a username from alertops_list_users.",
    inputSchema: {
      type: 'object',
      properties: {
        user_name: { type: 'string', description: 'Username, from alertops_list_users.' },
      },
      required: ['user_name'],
    },
  },
];

const TOOL_NAMES = new Set(USER_TOOLS.map((t) => t.name));
export function isUserTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

export async function handleUserTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  const creds = getCredentials();
  const missing = requireCredentials(creds);
  if (missing) return missing;

  try {
    if (name === 'alertops_list_users') {
      return textResult(await listUsers(creds!));
    }

    if (name === 'alertops_get_user_contact_methods') {
      return textResult(await getUserContactMethods(creds!, { userName: args.user_name as string }));
    }

    return errorResult(`Unknown tool: ${name}`);
  } catch (err) {
    return errorResult((err as Error).message);
  }
}
