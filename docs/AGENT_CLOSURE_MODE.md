# Agent Closure Mode

This document defines the non-negotiable closure gate for the ALTUM conversational agent.

## Goal

Stop incremental drift and regressions. A change is only "done" when it passes the gate below.

## Gate command

```bash
npm run test:agent-closure
```

The gate currently validates:

1. Smoke tests for core business and AI flows
2. Targeted lint on agent-critical files
3. TypeScript compile check (`tsc --noEmit`)

## Production readiness checklist (manual)

All items below must be true before declaring the agent "ready for scale":

1. Provider readiness
   - `OPENAI_API_KEY` or alternative provider keys are valid in production
   - no repeated auth/quota failures in inbox state
2. 24/7 operation
   - AI responds with page open and closed
   - internal AI worker endpoint is healthy
3. Contingency behavior
   - provider failure does not silence conversations
   - inbox shows contingency mode clearly
4. Cost and usage guard
   - monthly usage cap and budget cap trigger contingency mode
   - internal notification is generated for cap reached
5. Human handoff
   - pause/takeover/resume flows work without leaving stale lock states

## Exit criteria

The agent is "closure complete" only when:

1. Gate command passes
2. Production checklist is fully green
3. No unresolved dead-letter trend remains for active tenants
