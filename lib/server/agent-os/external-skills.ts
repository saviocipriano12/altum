import { readFileSync } from "node:fs";
import { join } from "node:path";

type ReviewedSkill = { id: string; sourceRepo: string; sourceCommit: string; license: string; sourcePath: string; category: string };
type Registry = { skills: ReviewedSkill[] };
const IDS_BY_FORMAT: Record<string, string[]> = { video: ["ai-video", "ai-voiceover", "ad-creative"], carousel: ["carousel-writer", "caption-writer", "ad-creative"], copy: ["ad-creative", "audience-intelligence", "client-proposal"], image: ["ad-creative", "audience-intelligence"] };

function registry() { return JSON.parse(readFileSync(join(process.cwd(), "config", "reviewed-external-skills.json"), "utf8")) as Registry; }
function description(id: string) {
  try {
    const content = readFileSync(join(process.cwd(), "resources", "agent-skills", "review-queue", `${id === "ai-video" ? "creative_video" : id === "ai-voiceover" ? "creative_audio" : ["carousel-writer", "caption-writer"].includes(id) ? "social" : id === "audience-intelligence" ? "research" : id === "client-proposal" ? "sales" : id === "analytics-insights" ? "analytics" : id.startsWith("campaign") ? "campaign" : "creative"}--${id}.md`), "utf8");
    const folded = content.match(/^description:\s*[>|][-]?\s*\r?\n\s+(.+?)\r?\n/m);
    const inline = content.match(/^description:\s*(.+)$/m)?.[1]?.trim().replace(/^(?:"|')|(?:"|')$/g, "");
    return (folded?.[1] || inline || "Guia externo importado para revisão.").trim().slice(0, 280);
  } catch { return "Guia externo importado para revisão."; }
}

export function creativeSkillReferences(format: "image" | "carousel" | "video" | "copy") {
  const allowed = new Set(IDS_BY_FORMAT[format] || []);
  return registry().skills.filter((skill) => allowed.has(skill.id)).map((skill) => ({ id: skill.id, sourceRepo: skill.sourceRepo, sourceCommit: skill.sourceCommit, license: skill.license, guidance: description(skill.id) }));
}
