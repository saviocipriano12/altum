export type TenantOperator = {
  userId: string;
  name: string;
  team: string;
  teamId: string;
  availability: "online" | "busy" | "offline";
  allowedChannels: string[];
  maxOpenChats: number | null;
};

export type InboxRoutingRules = {
  defaultTeam: string;
  teams: { id: string; channels: string[] }[];
  preferOnlineAgents: boolean;
  strictChannelRouting: boolean;
  fallbackToAnyAgent: boolean;
};
function clean(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function filterEligibleOperators(input: {
  operators: TenantOperator[];
  activeLoads: Map<string, number>;
  channel?: string | null;
  rules: InboxRoutingRules;
}) {
  const channel = clean(input.channel, 40).toLowerCase();
  let eligible = input.operators.filter((item) =>
    item.availability !== "offline" &&
    (!item.maxOpenChats || (input.activeLoads.get(item.userId) || 0) < item.maxOpenChats)
  );
  const channelTeamIds = channel
    ? input.rules.teams.filter((team) => team.channels.length === 0 || team.channels.includes(channel)).map((team) => team.id)
    : [];
  const preferredTeamIds = channelTeamIds.length > 0 ? channelTeamIds : [input.rules.defaultTeam].filter(Boolean);
  const teamMatched = eligible.filter((item) => preferredTeamIds.includes(item.teamId));
  if (teamMatched.length > 0) {
    eligible = teamMatched;
  } else if (!input.rules.fallbackToAnyAgent) {
    eligible = [];
  }

  if (channel) {
    const channelMatched = eligible.filter(
      (item) => item.allowedChannels.length === 0 || item.allowedChannels.includes(channel)
    );

    if (input.rules.strictChannelRouting) {
      if (channelMatched.length > 0) {
        eligible = channelMatched;
      } else if (!input.rules.fallbackToAnyAgent) {
        eligible = [];
      }
    } else if (channelMatched.length > 0) {
      eligible = channelMatched;
    }
  }

  eligible = eligible.filter((item) => {
    const maxOpenChats = Number(item.maxOpenChats || 0);
    if (!maxOpenChats) return true;
    return (input.activeLoads.get(item.userId) || 0) < maxOpenChats;
  });

  if (input.rules.preferOnlineAgents) {
    const online = eligible.filter((item) => item.availability === "online");
    if (online.length > 0) {
      eligible = online;
    }
  } else {
    eligible = eligible.filter((item) => item.availability !== "offline");
  }

  return eligible;
}

