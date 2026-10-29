import { createHash } from "node:crypto";

/** Existing manifest key, shared by deletion and late delivery receipts. */
export function tenantTrashSnapshotId(item: { collection: string; id: string }) {
  return createHash("sha256").update(`${item.collection}\0${item.id}`).digest("hex");
}
