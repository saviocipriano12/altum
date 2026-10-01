import { adminDb } from "@/app/lib/server/firebase-admin";
import { evaluateEcommerceExperiment } from "@/lib/ecommerce-agent-experiment";
import { summarizeEcommerceAgentVersions } from "@/lib/ecommerce-agent-performance";
import type { EcommerceAutomationSettings } from "@/lib/server/ecommerce";

export async function getEcommerceAgentPerformance(input: {
  tenantId: string;
  automation: EcommerceAutomationSettings;
}) {
  const championVersion = input.automation.agent.agentVersion;
  const challengerVersion = input.automation.agent.experiment.challengerVersion;
  const snap = await adminDb.collection("ecommerce_commercial_actions")
    .where("tenantId", "==", input.tenantId)
    .limit(1000)
    .get();
  const [champion, challenger] = summarizeEcommerceAgentVersions({
    actions: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    versions: [championVersion, challengerVersion],
  });
  const verdict = evaluateEcommerceExperiment({
    champion,
    challenger,
    config: input.automation.agent.experiment,
  });
  return { champion, challenger, verdict };
}
