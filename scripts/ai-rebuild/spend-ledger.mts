import { createRequire } from "node:module";
import { openSync, closeSync, statSync } from "node:fs";
import { EVALUATION_CANDIDATE, EVALUATION_SPEND_AUTHORIZATION } from "./budget.mts";

const SCOPE = "altum-shopify-rebuild-2026-10-19-usd3";
const CAP = EVALUATION_SPEND_AUTHORIZATION.approvedCumulativeCapUsd * 1_000_000;
// The checkout's Node type package predates node:sqlite. Keep this tool-local
// facade instead of changing production dependencies/types. Runtime is Node 24.
type SqlValue = string | number | null;
interface EvaluationDatabase {
  exec(sql: string): void; close(): void;
  prepare(sql: string): { run(...values: SqlValue[]): unknown; get(...values: SqlValue[]): Record<string, SqlValue> | undefined };
}
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (path: string) => EvaluationDatabase };
function amount(value: number, positive = false) {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) throw new Error("Valor monetario invalido; usar micros de USD inteiros.");
  return value;
}
function key(value: string) {
  if (!/^[a-zA-Z0-9_.:-]{1,200}$/.test(value)) throw new Error("Identificador de chamada/recibo invalido.");
  return value;
}
function connect(path: string) {
  const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
    return db;
  } catch (error) { db.close(); throw error; }
}
/** Explicit bootstrap only. Never call automatically when an existing ledger is missing. */
export function initializeSpendLedger(path: string) {
  // Exclusive creation refuses resets, including interrupted/empty bootstrap files.
  const fd = openSync(path, "wx"); closeSync(fd);
  const db = connect(path);
  try {
    db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE authority (id INTEGER PRIMARY KEY CHECK(id=1), scope TEXT NOT NULL, model TEXT NOT NULL,
        cap INTEGER NOT NULL CHECK(cap>0), frozen_reason TEXT NOT NULL DEFAULT '');
      CREATE TABLE calls (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, reserved INTEGER NOT NULL CHECK(reserved>0),
        actual INTEGER CHECK(actual>=0), status TEXT NOT NULL CHECK(status IN ('reserved','uncertain','settled','overrun')), receipt TEXT);
      CREATE TABLE audit (sequence INTEGER PRIMARY KEY, call_id TEXT, event TEXT NOT NULL, occurred_at TEXT NOT NULL);
    `);
    db.prepare("INSERT INTO authority(id,scope,model,cap) VALUES(1,?,?,?)").run(SCOPE, EVALUATION_CANDIDATE.model, CAP);
    db.prepare("INSERT INTO audit(event,occurred_at) VALUES('authorized',?)").run(new Date().toISOString());
    db.exec("COMMIT");
  } finally { db.close(); }
}

export class EvaluationSpendLedger {
  private db: EvaluationDatabase;
  constructor(path: string) {
    // No create-if-missing or default balance. The real file and its WAL must be
    // preserved across runs, not restored from an older fixture snapshot.
    if (!statSync(path).isFile() || statSync(path).size === 0) throw new Error("Registro de gasto ausente/incompleto; nao recriar saldo.");
    this.db = connect(path);
    try { this.authority(); } catch (error) { this.db.close(); throw error; }
  }
  close() { this.db.close(); }
  private authority() {
    const row = this.db.prepare("SELECT * FROM authority WHERE id=1").get();
    if (!row || row.scope !== SCOPE || row.model !== EVALUATION_CANDIDATE.model || row.cap !== CAP) throw new Error("Autorizacao do registro divergente; gasto bloqueado.");
    return row;
  }
  snapshot() {
    const authority = this.authority();
    const row = this.db.prepare(`SELECT COALESCE(SUM(CASE WHEN status IN ('settled','overrun') THEN actual ELSE reserved END),0) AS committed,
      COUNT(*) AS calls, SUM(CASE WHEN status IN ('reserved','uncertain') THEN 1 ELSE 0 END) AS outstanding,
      COALESCE(SUM(CASE WHEN status IN ('settled','overrun') THEN actual ELSE 0 END),0) AS confirmed FROM calls`).get()!;
    const committed = Number(row.committed);
    if (!Number.isSafeInteger(committed) || committed < 0) throw new Error("Registro monetario inconsistente.");
    return { scope: SCOPE, model: EVALUATION_CANDIDATE.model, capMicrousd: CAP,
      committedMicrousd: committed, confirmedMicrousd: Number(row.confirmed), remainingMicrousd: Math.max(0, CAP - committed),
      calls: Number(row.calls), outstanding: Number(row.outstanding || 0), frozenReason: String(authority.frozen_reason) };
  }
  private transaction<T>(action: () => T) {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = action(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  private audit(callId: string, event: string) {
    this.db.prepare("INSERT INTO audit(call_id,event,occurred_at) VALUES(?,?,?)").run(callId, event, new Date().toISOString());
  }
  reserve(input: { callId: string; fingerprint: string; maximumMicrousd: number }) {
    key(input.callId); amount(input.maximumMicrousd, true);
    if (!/^[a-f0-9]{64}$/.test(input.fingerprint)) throw new Error("Fingerprint invalido.");
    return this.transaction(() => {
      const balance = this.snapshot();
      if (balance.frozenReason) throw new Error("Registro congelado; nenhuma nova chamada permitida.");
      const prior = this.db.prepare("SELECT fingerprint FROM calls WHERE id=?").get(input.callId);
      if (prior) throw new Error(prior.fingerprint === input.fingerprint ? "Chamada ja reservada; nao repetir envio." : "Chamada reutilizada com outro payload.");
      if (balance.remainingMicrousd < input.maximumMicrousd) throw new Error("Teto acumulado de US$ 3 insuficiente para reservar esta chamada.");
      this.db.prepare("INSERT INTO calls(id,fingerprint,reserved,status) VALUES(?,?,?,'reserved')")
        .run(input.callId, input.fingerprint, input.maximumMicrousd);
      this.audit(input.callId, "reserved_before_dispatch");
      return this.snapshot();
    });
  }
  markUncertain(callId: string) {
    key(callId);
    return this.transaction(() => {
      this.authority();
      const prior = this.db.prepare("SELECT status FROM calls WHERE id=?").get(callId);
      if (!prior) throw new Error("Chamada sem reserva.");
      if (prior.status === "reserved") {
        this.db.prepare("UPDATE calls SET status='uncertain' WHERE id=?").run(callId);
        this.audit(callId, "uncertain_reservation_retained");
      }
      return this.snapshot();
    });
  }
  settle(input: { callId: string; actualMicrousd: number; receiptId: string }) {
    key(input.callId); key(input.receiptId); amount(input.actualMicrousd);
    return this.transaction(() => {
      this.authority();
      const prior = this.db.prepare("SELECT * FROM calls WHERE id=?").get(input.callId);
      if (!prior) throw new Error("Chamada sem reserva.");
      if (["settled", "overrun"].includes(String(prior.status))) {
        if (prior.actual !== input.actualMicrousd || prior.receipt !== input.receiptId) throw new Error("Recibo de custo conflitante.");
        return this.snapshot();
      }
      const overrun = input.actualMicrousd > Number(prior.reserved);
      this.db.prepare("UPDATE calls SET status=?,actual=?,receipt=? WHERE id=?")
        .run(overrun ? "overrun" : "settled", input.actualMicrousd, input.receiptId, input.callId);
      if (overrun) this.db.prepare("UPDATE authority SET frozen_reason='provider_cost_exceeded_reservation' WHERE id=1").run();
      this.audit(input.callId, overrun ? "cost_overrun_frozen" : "settled_from_provider_usage");
      return this.snapshot();
    });
  }
}
