# Node 24, not 20: `node:sqlite` is a built-in from Node 22 onward, and the
# Events of Interest store uses it. On 20 it throws ERR_UNKNOWN_BUILTIN_MODULE.
# Bumping the base is what avoids adding better-sqlite3, which on Alpine/musl
# would mean compiling a native module (python3 + make + g++ in the image).
# NOTE: `docker compose up -d --force-recreate` does NOT pick up a change to
# this file — the image must be rebuilt (`up -d --build`).
FROM node:24-alpine
WORKDIR /app

# Install dependencies
COPY app/package.json .
RUN npm install
RUN npm install -g nodemon

# Copy app files
COPY app/triage.js .
COPY app/lib ./lib

# NOTE: config (.env, credentials.json, token.json, *.json) is NOT baked into the
# image — it is bind-mounted at runtime via compose.yaml. Baking secrets here was
# redundant (the mounts override them) and left credentials in the image layers.

EXPOSE 3000
# --ignore web/dist/*: web/dist is bind-mounted; rebuilding the React bundle on
# deploy must NOT restart the node server (it only serves those static files).
CMD ["nodemon", "--ignore", "*.json", "--ignore", "web/dist/*", "triage.js"]
