import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const hotspotRouteReferences: Array<{ surface: string; route: string }> = [
  { surface: 'admin/chat', route: '/api/whatsapp/send' },
  { surface: 'admin/chat', route: '/api/chats/transfer' },

  { surface: 'cliente/inbox', route: '/api/tenant/[tenantId]/chats' },
  { surface: 'cliente/inbox', route: '/api/tenant/[tenantId]/chats/[chatId]' },
  { surface: 'cliente/inbox', route: '/api/tenant/[tenantId]/chats/[chatId]/messages' },
  { surface: 'cliente/inbox', route: '/api/tenant/[tenantId]/chats/[chatId]/send' },
  { surface: 'cliente/inbox', route: '/api/tenant/[tenantId]/chats/[chatId]/ai-state' },
  { surface: 'cliente/inbox', route: '/api/tenant/[tenantId]/chats/[chatId]/notes' },
  { surface: 'cliente/inbox', route: '/api/tenant/[tenantId]/chats/distribute' },
  { surface: 'cliente/inbox', route: '/api/tenant/[tenantId]/leads/[leadId]/stage' },
  { surface: 'cliente/inbox', route: '/api/tenant/[tenantId]/leads/[leadId]/tasks' },
  { surface: 'cliente/inbox', route: '/api/tenant/[tenantId]/leads/[leadId]/tasks/[taskId]' },
  { surface: 'cliente/inbox', route: '/api/tenant/[tenantId]/leads/[leadId]/notes' },

  { surface: 'cliente/automacoes', route: '/api/tenant/[tenantId]/automation-summary' },
  { surface: 'cliente/automacoes', route: '/api/tenant/[tenantId]/automations' },
  { surface: 'cliente/automacoes', route: '/api/tenant/[tenantId]/automations/[automationId]' },
  { surface: 'cliente/automacoes', route: '/api/tenant/[tenantId]/automations/process' },

  { surface: 'cliente/captacao', route: '/api/tenant/[tenantId]/capture/forms' },
  { surface: 'cliente/captacao', route: '/api/tenant/[tenantId]/capture/forms/[formId]' },
  { surface: 'cliente/captacao', route: '/api/tenant/[tenantId]/users' },
  { surface: 'cliente/captacao', route: '/api/tenant/[tenantId]/channels' },

  { surface: 'cliente/comercial', route: '/api/tenant/[tenantId]/leads' },
  { surface: 'cliente/comercial', route: '/api/tenant/[tenantId]/budgets' },
  { surface: 'cliente/comercial', route: '/api/tenant/[tenantId]/budgets/[budgetId]' },
  { surface: 'cliente/comercial', route: '/api/tenant/[tenantId]/finance' },
  { surface: 'cliente/comercial', route: '/api/tenant/[tenantId]/finance/[financeId]' },
  { surface: 'cliente/comercial', route: '/api/tenant/[tenantId]/finance/create-charge' },
];

function routeToFile(route: string) {
  return join(process.cwd(), 'app', route.slice(1), 'route.ts');
}

test('hotspot route references resolve to real route files', () => {
  const missing = hotspotRouteReferences.filter((item) => !existsSync(routeToFile(item.route)));

  assert.deepEqual(
    missing,
    [],
    `Hotspot references with missing route files: ${missing.map((item) => `${item.surface} -> ${item.route}`).join(', ')}`
  );
});
