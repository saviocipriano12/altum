import test from "node:test";
import assert from "node:assert/strict";
import { filterEligibleOperators } from "../lib/inbox-routing-policy.ts";
const operator = (userId, extra = {}) => ({ userId, name: userId, team: "sales", teamId: "sales", availability: "online", allowedChannels: [], maxOpenChats: null, ...extra });
const rules = { defaultTeam: "sales", teams: [], preferOnlineAgents: true, strictChannelRouting: true, fallbackToAnyAgent: false };
const eligible = (operators, extra = {}) => filterEligibleOperators({ operators, activeLoads: new Map(), channel: "whatsapp", rules, ...extra });
test("never assigns offline operators when everyone is offline", () => {
  assert.deepEqual(eligible([operator("a", { availability: "offline" })]), []);
});
test("full online operator does not hide available busy operator", () => {
  assert.deepEqual(eligible([operator("a", { maxOpenChats: 1 }), operator("b", { availability: "busy" })], { activeLoads: new Map([["a", 1]]) }).map(x => x.userId), ["b"]);
});
test("strict channel coverage without fallback leaves work unassigned", () => {
  assert.deepEqual(eligible([operator("a", { allowedChannels: ["instagram"] })]), []);
});
test("channel team takes precedence over default team", () => {
  assert.deepEqual(eligible([operator("a"), operator("b", { teamId: "support" })], { rules: { ...rules, teams: [{ id: "support", channels: ["whatsapp"] }] } }).map(x => x.userId), ["b"]);
});
test("missing team without fallback leaves work unassigned", () => {
  assert.deepEqual(eligible([operator("a", { teamId: "other" })]), []);
});
test("busy operator with channel permission is preferred over online operator without it", () => {
  assert.deepEqual(eligible([operator("a", { allowedChannels: ["instagram"] }), operator("b", { availability: "busy", allowedChannels: ["whatsapp"] })]).map(x => x.userId), ["b"]);
});
