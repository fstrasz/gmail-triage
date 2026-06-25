FROM node:20-alpine
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
