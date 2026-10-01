export const scopes = [
  "context:read",
  "crm:read",
  "crm:write",
  "inbox:read",
  "inbox:write",
  "reports:read",
  "integrations:read",
  "integrations:write",
  "events:read",
  "marketing:read",
  "marketing:draft",
  "automation:write",
  "knowledge:write",
  "calendar:write",
  "settings:write",
  "ai:draft",
] as const;

export type Scope = (typeof scopes)[number];

export const MCP_WRITE_SCOPES = scopes.filter(
  (scope) => scope.endsWith(":write") || scope.endsWith(":draft")
);
