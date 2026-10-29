import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// Wiring proof only. Authentication, real webhook replay and provider contracts
// still require integration evidence; a source-text check cannot approve them.
test("all migrated inbound producers pass the persisted message ID, never text or a new retry ID", async () => {
  const paths: Array<[string, number, string]> = [
    ["app/api/webhooks/whatsapp/route.ts", 2, "incomingMessageRef.id"],
    ["app/api/webhooks/meta/route.ts", 1, "messageRef.id"],
    ["app/api/public/chats/[chatId]/messages/route.ts", 1, "messageRef.id"],
    ["lib/server/meta-conversation-sync.ts", 1, "ref.id"],
  ];
  for (const [path, expectedCount, expectedBinding] of paths) {
    const source = ts.createSourceFile(path, await readFile(new URL(`../${path}`, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
    const bindings: string[] = [];
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && node.expression.getText(source) === "runLeadAutomations") {
        const argument = node.arguments[0];
        if (argument && ts.isObjectLiteralExpression(argument)) {
          const properties = argument.properties.filter(ts.isPropertyAssignment);
          const trigger = properties.find(property => property.name.getText(source) === "trigger")?.initializer;
          if (trigger && ts.isStringLiteral(trigger) && trigger.text === "message_received") {
            bindings.push(properties.find(property => property.name.getText(source) === "sourceMessageId")?.initializer.getText(source) || "missing");
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    assert.equal(bindings.length, expectedCount, path);
    assert.ok(bindings.every(binding => binding === expectedBinding), `${path}: source event binding changed`);
  }
});
