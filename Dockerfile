# Nobat production image. Data lives in /data (mount a persistent disk there).
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production DB_FILE=/data/nobat.db PORT=3000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY public ./public
COPY scripts ./scripts
# Runs as root: hosting disks (like Render's) are mounted owned by root, so a restricted user can't write the database.
RUN mkdir -p /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.js"]
