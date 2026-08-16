FROM node:20-alpine
WORKDIR /app

# System deps Baileys needs for QR + image decoding
RUN apk add --no-cache python3 make g++ vips-dev

COPY package*.json ./
RUN npm install --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "src/server.js"]
