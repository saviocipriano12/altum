import { getTenantSettings } from "@/lib/server/tenant";

export type LeadSchedulingAdapter = {
  provider: "google_calendar";
  status: "not_configured" | "ready";
  syncReady: boolean;
  calendarId: string | null;
  suggestedEvent: {
    title: string;
    startAt: string;
    endAt: string;
    description: string;
    attendees: string[];
  };
};

function cleanText(value: unknown, max = 500) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function nextSuggestedMeetingDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  const end = new Date(date.getTime() + 45 * 60 * 1000);
  return {
    startAt: date.toISOString(),
    endAt: end.toISOString(),
  };
}

export async function buildLeadSchedulingAdapter(input: {
  tenantId: string;
  lead: Record<string, unknown>;
}) {
  const settings = await getTenantSettings(input.tenantId);
  const integrations =
    settings?.integrations && typeof settings.integrations === "object"
      ? (settings.integrations as Record<string, unknown>)
      : {};
  const googleCalendar =
    integrations.googleCalendar && typeof integrations.googleCalendar === "object"
      ? (integrations.googleCalendar as Record<string, unknown>)
      : {};
  const calendarId = cleanText(googleCalendar.calendarId, 180) || null;
  const meetingWindow = nextSuggestedMeetingDate();
  const leadName = cleanText(input.lead.nome, 180) || "Lead";
  const leadCompany = cleanText(input.lead.empresa, 180);
  const leadEmail = cleanText(input.lead.email, 180);
  const leadPhone = cleanText(input.lead.telefone, 40);

  return {
    provider: "google_calendar",
    status: calendarId ? "ready" : "not_configured",
    syncReady: Boolean(calendarId),
    calendarId,
    suggestedEvent: {
      title: `Reuniao comercial - ${leadName}`,
      startAt: meetingWindow.startAt,
      endAt: meetingWindow.endAt,
      description: [
        `Lead: ${leadName}`,
        leadCompany ? `Empresa: ${leadCompany}` : "",
        leadPhone ? `Telefone: ${leadPhone}` : "",
        cleanText(input.lead.notes, 400) ? `Resumo: ${cleanText(input.lead.notes, 400)}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      attendees: leadEmail ? [leadEmail] : [],
    },
  } satisfies LeadSchedulingAdapter;
}
