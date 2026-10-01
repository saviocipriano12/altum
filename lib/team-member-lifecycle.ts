export const COMMERCIAL_OWNER_FIELDS = [
  "assignedTo",
  "ownerId",
  "ownerUserId",
  "assignedUserId",
  "responsavelId",
] as const;

export type OwnershipRecord = Record<string, unknown>;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function recordBelongsToUser(record: OwnershipRecord, userId: string) {
  const target = clean(userId);
  return Boolean(target && COMMERCIAL_OWNER_FIELDS.some((field) => clean(record[field]) === target));
}

export function buildOwnershipTransferPatch(
  record: OwnershipRecord,
  fromUserId: string,
  toUser?: { userId: string; name?: string } | null
) {
  const from = clean(fromUserId);
  const to = clean(toUser?.userId);
  const patch: OwnershipRecord = {};

  for (const field of COMMERCIAL_OWNER_FIELDS) {
    if (clean(record[field]) === from) patch[field] = to || null;
  }

  if (Object.keys(patch).length && "ownerName" in record) patch.ownerName = clean(toUser?.name) || null;
  if (Object.keys(patch).length && "assignedToName" in record) patch.assignedToName = clean(toUser?.name) || null;
  if (Object.keys(patch).length && "responsavelNome" in record) patch.responsavelNome = clean(toUser?.name) || null;

  return patch;
}

export function buildPersonalChannelTransferPatch(
  channel: OwnershipRecord,
  fromUserId: string,
  toUser?: { userId: string; name?: string } | null
) {
  if (clean(channel.channelScope).toLowerCase() !== "personal" || clean(channel.ownerUserId) !== clean(fromUserId)) {
    return {};
  }

  if (toUser?.userId) {
    return {
      channelScope: "personal",
      ownerUserId: clean(toUser.userId),
      ownerUserName: clean(toUser.name) || "Novo responsável",
      distributionEnabled: false,
    };
  }

  return {
    channelScope: "shared",
    ownerUserId: null,
    ownerUserName: null,
    distributionEnabled: true,
  };
}
