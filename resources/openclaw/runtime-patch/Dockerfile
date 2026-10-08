# The audited OpenClaw runtime is built separately from the pinned source
# checkout. This tiny, deterministic layer carries Altum's private bridge so
# a bridge change never has to rebuild OpenClaw's full control UI.
FROM altum-openclaw:local

# Build only the Altum-owned extension against the already-audited runtime.
# `openclaw/*` remains external and resolves through the pinned runtime image;
# this avoids recompiling OpenClaw itself on a small VPS.
COPY --chown=node:node altum-mission-bridge/index.ts.template /tmp/altum-mission-bridge.ts
RUN /app/node_modules/.bin/esbuild /tmp/altum-mission-bridge.ts \
  --platform=node --format=esm --packages=external \
  --outfile=/app/dist/extensions/altum-mission-bridge/index.js

COPY --chown=node:node runtime-patch/openclaw.plugin.json /app/extensions/altum-mission-bridge/openclaw.plugin.json
COPY --chown=node:node runtime-patch/openclaw.plugin.json /app/dist/extensions/altum-mission-bridge/openclaw.plugin.json

USER node
