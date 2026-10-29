# The audited OpenClaw runtime is built separately from the pinned source
# checkout. This tiny, deterministic layer carries Altum's private bridge so
# a bridge change never has to rebuild OpenClaw's full control UI.
FROM altum-openclaw:local AS bridge-build

# Build only the Altum-owned extension against the already-audited runtime.
# `openclaw/*` remains external and resolves through the pinned runtime image;
# this avoids recompiling OpenClaw itself on a small VPS.
COPY --chown=node:node altum-mission-bridge/index.ts.template /tmp/altum-mission-bridge.ts
# Upstream's runtime excludes devDependencies, including esbuild. Compile in
# a disposable stage using the same pinned compiler version as the checkout.
RUN npx --yes --package=esbuild@0.28.2 esbuild /tmp/altum-mission-bridge.ts \
  --platform=node --format=esm --packages=external \
  --outfile=/tmp/altum-mission-bridge.js

FROM altum-openclaw:local
COPY --from=bridge-build --chown=node:node /tmp/altum-mission-bridge.js /app/dist/extensions/altum-mission-bridge/index.js

COPY --chown=node:node runtime-patch/openclaw.plugin.json /app/extensions/altum-mission-bridge/openclaw.plugin.json
COPY --chown=node:node runtime-patch/openclaw.plugin.json /app/dist/extensions/altum-mission-bridge/openclaw.plugin.json

USER node
