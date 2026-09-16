# KilimoOrbit Sentinel — Mission Control + APEX engine
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=4517 TRUST_PROXY=1
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
COPY payloads ./payloads
# Soko flat-file store lives here — mount a volume to persist listings.
RUN mkdir -p /app/data && chown -R node:node /app
USER node
VOLUME ["/app/data"]
EXPOSE 4517
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:4517/api/health || exit 1
CMD ["node", "src/server.js"]
