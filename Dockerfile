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

CMD ["node", "server/index.js"]
# Test trajnosti 3 (nakon ispravnog mount-anja diska)
