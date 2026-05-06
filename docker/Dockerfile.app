# Build stage - web UI
FROM node:20-slim AS web-builder
WORKDIR /app

COPY web/package*.json ./
RUN npm ci

COPY web/ .
RUN npm run build

# Build stage - backend
FROM node:20-slim AS backend-builder
WORKDIR /app

COPY backend/package*.json ./
RUN npm ci

COPY backend/ .
RUN npm run build:backend

# Runtime stage
FROM node:20-slim
WORKDIR /app

# Install Prisma for migrations
RUN npm install prisma@^6.19.2 -g

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend/prisma ./prisma
COPY --from=backend-builder /app/dist ./dist
COPY --from=web-builder /app/dist ./web/dist
RUN mkdir -p uploads

# Generate Prisma client (required before app starts)
RUN npx prisma generate

EXPOSE 4000

ENV NODE_ENV=production

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
