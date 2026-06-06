export type OutboundScheduledJob = {
  leadIds: string[];
  dueAt: Date;
};

export function buildOutboundJobSchedule(input: {
  leadIds: string[];
  sendRatePerMinute: number;
  startsAt: Date;
}) {
  const rate = Math.max(1, Math.min(120, Math.floor(Number(input.sendRatePerMinute) || 1)));
  const startsAt = Number.isNaN(input.startsAt.getTime()) ? new Date() : input.startsAt;
  const leadIds = Array.from(new Set(input.leadIds.map((item) => item.trim()).filter(Boolean)));
  const jobs: OutboundScheduledJob[] = [];

  for (let index = 0; index < leadIds.length; index += rate) {
    jobs.push({
      leadIds: leadIds.slice(index, index + rate),
      dueAt: new Date(startsAt.getTime() + jobs.length * 60_000),
    });
  }

  return jobs;
}
