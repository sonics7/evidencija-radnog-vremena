FROM --platform=linux/amd64 node:18-bookworm-slim

# Alati potrebni za kompajliranje nativnog modula better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Prisili kompajliranje better-sqlite3 iz izvornog koda u OVOM tocno kontejneru,
# umjesto koristenja gotovog (prebuilt) binarnog paketa koji moze biti
# nekompatibilan s arhitekturom na kojoj se kontejner stvarno pokrece.
ENV npm_config_build_from_source=true

RUN npm install --prefix server \
    && npm install --prefix client

COPY server ./server
COPY client ./client

RUN npm run build --prefix client

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "server/index.js"]
# Force rebuild - Railway custom start/build command override removed 2026-09-21T11:04:16.5189599+02:00
