import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRuntimeArtifactEvidence } from "@/lib/server/agent-os/agent-evidence";

test("runtime artifacts are normalized into the canonical evidence kinds", () => {
  assert.deepEqual(
    normalizeRuntimeArtifactEvidence({
      kind: "source",
      label: "Fonte de mercado",
      url: "https://example.com/source",
    }),
    {
      kind: "source",
      label: "Fonte de mercado",
      uri: "https://example.com/source",
    },
  );
  assert.deepEqual(
    normalizeRuntimeArtifactEvidence({
      kind: "rendered_video",
      label: " Vídeo final ",
    }),
    { kind: "artifact", label: "Vídeo final", uri: null },
  );
  assert.deepEqual(
    normalizeRuntimeArtifactEvidence({
      kind: "artifact",
      label: "Link não confiável",
      url: "javascript:alert(1)",
    }),
    { kind: "artifact", label: "Link não confiável", uri: null },
  );
});
