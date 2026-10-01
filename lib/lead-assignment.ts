import { inferClientAccessProfile } from "./client-access-profiles.ts";

export type LeadAssignmentMember = {
  userId: string;
  name: string;
  role?: string | null;
  status?: string | null;
  accessProfile?: string | null;
  capabilities?: string[] | null;
  availability?: string | null;
  presenceState?: string | null;
  teamId?: string | null;
  team?: string | null;
  maxOpenChats?: number | null;
};

export type EligibleSeller = {
  userId: string;
  name: string;
  availability?: string | null;
  presenceState?: string | null;
  teamId?: string | null;
  maxOpenChats?: number | null;
};

export function isEligibleLeadSeller(member: LeadAssignmentMember) {
  if (!member.userId || member.status === "blocked" || member.status === "inactive") return false;
  return inferClientAccessProfile({
    role: member.role || undefined,
    accessProfile: member.accessProfile || undefined,
    capabilities: member.capabilities || undefined,
  }).id === "seller";
}

export function eligibleLeadSellers(members: LeadAssignmentMember[]) {
  return members
    .filter(isEligibleLeadSeller)
    .map(({ userId, name, availability, presenceState, teamId, team, maxOpenChats }) => ({
      userId,
      name: name || "Vendedor",
      availability: availability || null,
      presenceState: presenceState || null,
      teamId: teamId || team || null,
      maxOpenChats: typeof maxOpenChats === "number" && maxOpenChats > 0 ? maxOpenChats : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.userId.localeCompare(b.userId));
}

export function balanceLeadAssignments(input: {
  leadIds: string[];
  sellers: EligibleSeller[];
  currentLoads: Map<string, number>;
  teamId?: string | null;
}) {
  const requestedTeam = String(input.teamId || "").trim();
  const sellers = input.sellers.filter((seller) => {
    if (requestedTeam && seller.teamId !== requestedTeam) return false;
    if (["offline", "busy", "unavailable"].includes(String(seller.availability || "").toLowerCase())) return false;
    return (input.currentLoads.get(seller.userId) || 0) < (seller.maxOpenChats || Number.POSITIVE_INFINITY);
  });
  const loads = new Map(sellers.map((seller) => [seller.userId, input.currentLoads.get(seller.userId) || 0]));
  return input.leadIds.map((leadId) => {
    const seller = [...sellers]
      .filter((candidate) => (loads.get(candidate.userId) || 0) < (candidate.maxOpenChats || Number.POSITIVE_INFINITY))
      .sort((a, b) => {
      const loadDifference = (loads.get(a.userId) || 0) - (loads.get(b.userId) || 0);
      if (loadDifference) return loadDifference;
      const presenceDifference = Number(b.presenceState === "online") - Number(a.presenceState === "online");
      return presenceDifference || a.name.localeCompare(b.name, "pt-BR") || a.userId.localeCompare(b.userId);
    })[0];
    if (!seller) return null;
    loads.set(seller.userId, (loads.get(seller.userId) || 0) + 1);
    return { leadId, userId: seller.userId, userName: seller.name };
  }).filter((item): item is { leadId: string; userId: string; userName: string } => Boolean(item));
}

export function randomLeadAssignments(input: {
  leadIds: string[];
  sellers: EligibleSeller[];
  currentLoads: Map<string, number>;
  teamId?: string | null;
  random?: () => number;
}) {
  const requestedTeam = String(input.teamId || "").trim();
  const random = input.random || Math.random;
  const loads = new Map(input.sellers.map((seller) => [seller.userId, input.currentLoads.get(seller.userId) || 0]));

  return input.leadIds.map((leadId) => {
    const candidates = input.sellers.filter((seller) => {
      if (requestedTeam && seller.teamId !== requestedTeam) return false;
      if (["offline", "busy", "unavailable"].includes(String(seller.availability || "").toLowerCase())) return false;
      return (loads.get(seller.userId) || 0) < (seller.maxOpenChats || Number.POSITIVE_INFINITY);
    });
    if (!candidates.length) return null;
    const seller = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
    loads.set(seller.userId, (loads.get(seller.userId) || 0) + 1);
    return { leadId, userId: seller.userId, userName: seller.name };
  }).filter((item): item is { leadId: string; userId: string; userName: string } => Boolean(item));
}
