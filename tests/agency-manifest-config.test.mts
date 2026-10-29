import assert from "node:assert/strict";
import test from "node:test";
import manifestConfig from "@/config/agency-agent-manifests.json";
import { activationReadiness, agentManifestSchema } from "@/lib/server/agent-os/agent-manifest";
import { getImportedAgencyAgent } from "@/lib/server/agent-os/agency-catalog";

test("configured agency manifests are valid and bound to imported upstream agents", () => {
  assert.equal(manifestConfig.schemaVersion, 1);
  assert.equal(manifestConfig.status, "draft_manifests");
  const ids = new Set<string>();
  for (const raw of manifestConfig.manifests) {
    const manifest = agentManifestSchema.parse(raw);
    assert.equal(ids.has(manifest.agentId), false, `duplicate manifest: ${manifest.agentId}`);
    ids.add(manifest.agentId);
    const imported = getImportedAgencyAgent(manifest.agentId);
    assert.ok(imported, `missing imported upstream agent: ${manifest.agentId}`);
    assert.equal(manifest.source.repo, imported.source.repo);
    assert.equal(manifest.source.commit, imported.source.commit);
    assert.equal(manifest.source.path, imported.sourcePath);
    assert.equal(manifest.status, "review_required");
    assert.equal(activationReadiness(manifest).ready, false);
  }
});
