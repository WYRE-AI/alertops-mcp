import { describe, expect, it } from 'vitest';
import { ALL_TOOLS } from '../tools/index.js';

/**
 * Hard scope boundary (see README's Scope section for the full accounting
 * against AlertOps' OpenAPI spec): this connector must NEVER expose a tool
 * that creates, closes, updates, assigns, notes, replies to, or adds
 * recipients to an alert, or that creates a user/group/schedule/maintenance
 * window - AlertOps is a live incident-paging system, so any of those could
 * trigger a real page/notification to a human. Pin the exact tool set so an
 * accidental addition fails this test immediately rather than silently
 * shipping.
 */
describe('ALL_TOOLS scope boundary', () => {
  const EXPECTED_TOOL_NAMES = [
    // Alerts
    'alertops_list_alerts',
    'alertops_get_alert_id_by_inbound_message_id',
    'alertops_get_alert_id_by_unique_inbound_id',
    // Users
    'alertops_list_users',
    'alertops_get_user_contact_methods',
    // Groups
    'alertops_list_groups',
    // Topics
    'alertops_list_topics',
    // Integrations
    'alertops_list_integrations',
    // Schedule
    'alertops_get_oncall_now',
    'alertops_get_user_schedule',
    'alertops_get_group_schedule',
  ].sort();

  it("exposes exactly this connector's 11 read-only tools - nothing more, nothing less", () => {
    const names = ALL_TOOLS.map((t) => t.name).sort();
    expect(names).toEqual(EXPECTED_TOOL_NAMES);
    expect(names).toHaveLength(11);
  });

  it('never exposes a tool that could trigger a real page/notification, or any other write', () => {
    // Forbidden as a whole underscore-token, not a substring - so this does
    // NOT false-positive on e.g. 'alertops_list_alerts' ('alerts' has no
    // banned token) or 'alertops_get_alert_id_by_unique_inbound_id' ('id'
    // is not 'assign').
    const FORBIDDEN_TOKENS = new Set([
      'create',
      'close',
      'update',
      'assign',
      'note',
      'reply',
      'add',
      'delete',
      'remove',
      'maintenance', // CreateMaintenanceWindows
      'outofoffice',
      'recipients',
    ]);

    for (const tool of ALL_TOOLS) {
      const tokens = tool.name.split('_');
      for (const token of tokens) {
        expect(
          FORBIDDEN_TOKENS.has(token),
          `Tool "${tool.name}" contains forbidden token "${token}" - this connector must stay read-only.`,
        ).toBe(false);
      }
    }
  });

  it('every tool name is prefixed with alertops_', () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.name.startsWith('alertops_')).toBe(true);
    }
  });
});
