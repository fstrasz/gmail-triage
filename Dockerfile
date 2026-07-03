FROM node:20-alpine
WORKDIR /app

# Install production dependencies from the lockfile (reproducible). --omit=dev drops
# nodemon: code is baked (not bind-mounted), so there is nothing to live-reload.
COPY app/package.json app/package-lock.json ./
RUN npm ci --omit=dev

# Bake app code into the image (no longer bind-mounted -- see compose.yaml).
COPY app/triage.js ./triage.js
COPY app/lib ./lib
# Bake the built React bundle. Lands at /app/web/dist -- resolveWebDist's container
# candidate (<moduleDir>/web/dist) already probes exactly this path, so /app keeps
# working with no resolver change (F28 stays fixed by the same code).
COPY web/dist ./web/dist

# NOTE: config (.env, credentials.json, token.json, *.json) is NOT baked -- it is
# bind-mounted at runtime via compose.yaml, keeping secrets out of the image layers.

EXPOSE 3000
CMD ["node", "triage.js"]
