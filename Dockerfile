FROM node:22-bookworm-slim

WORKDIR /app

COPY server/package*.json ./server/
COPY client/package*.json ./client/

RUN npm install --prefix server \
    && npm install --prefix client

COPY server ./server
COPY client ./client

RUN npm run build --prefix client

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "server/index.js"]# Test trajnosti diska 2026-09-21T13:24:12.5710017+02:00
# Test trajnosti diska 2 2026-09-21T13:29:47.7217920+02:00
