FROM node:20-alpine
WORKDIR /app

# Install dependencies
COPY app/package.json .
RUN npm install
RUN npm install -g nodemon

# Copy app files
COPY app/triage.js .
COPY app/lib ./lib

# Copy config
COPY config/.env .
COPY config/credentials.json .

EXPOSE 3000
CMD ["nodemon", "--ignore", "*.json", "triage.js"]
