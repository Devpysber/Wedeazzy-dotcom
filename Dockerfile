# Production image for the whole platform: backend API + the public/ website
# that Express static-serves. Build context is the repo ROOT (not backend/),
# because backend/Dockerfile alone cannot reach ../public and the server
# resolves its static dir as <src>/../public.
# Debian base, not alpine: Prisma 5's musl engine needs an openssl/libc6-compat
# dance that broke the schema engine outright ("Could not parse schema engine
# response"), and sharp's glibc prebuilds install cleanly here.
FROM node:20-bookworm-slim
WORKDIR /app

# openssl is what Prisma probes to pick its query/schema engine build.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates     && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./
RUN npm install --omit=dev

COPY backend/prisma ./prisma
RUN npx prisma generate

COPY backend/src ./src
COPY public ./public

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "src/server.js"]
