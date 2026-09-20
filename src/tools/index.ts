import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ALERT_TOOLS, handleAlertTool, isAlertTool } from './alerts.js';
import { USER_TOOLS, handleUserTool, isUserTool } from './users.js';
import { GROUP_TOOLS, handleGroupTool, isGroupTool } from './groups.js';
import { TOPIC_TOOLS, handleTopicTool, isTopicTool } from './topics.js';
import { INTEGRATION_TOOLS, handleIntegrationTool, isIntegrationTool } from './integrations.js';
import { SCHEDULE_TOOLS, handleScheduleTool, isScheduleTool } from './schedule.js';
import type { CallToolResult } from './types.js';

export const ALL_TOOLS: Tool[] = [
  ...ALERT_TOOLS,
  ...USER_TOOLS,
  ...GROUP_TOOLS,
  ...TOPIC_TOOLS,
  ...INTEGRATION_TOOLS,
  ...SCHEDULE_TOOLS,
];

export async function dispatchToolCall(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  if (isAlertTool(name)) return handleAlertTool(name, args);
  if (isUserTool(name)) return handleUserTool(name, args);
  if (isGroupTool(name)) return handleGroupTool(name, args);
  if (isTopicTool(name)) return handleTopicTool(name, args);
  if (isIntegrationTool(name)) return handleIntegrationTool(name, args);
  if (isScheduleTool(name)) return handleScheduleTool(name, args);
  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
}
