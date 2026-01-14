# Stage 1: Build frontend (Vue/Vite) - unchanged
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json .
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Runtime (slim, prod-only)
FROM node:20-alpine

WORKDIR /app

# Install prod deps FIRST (as root → safe & fast)
COPY package*.json .
RUN npm install --production --no-audit --no-fund   # optional flags speed it up a bit

# NOW copy built stuff
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server

# Create non-root user and switch (AFTER npm install!)
RUN addgroup -g 1001 nodejs && \
    adduser -S -u 1001 -G nodejs nextuser && \
    chown -R nextuser:nodejs /app

USER nextuser

EXPOSE 3000

CMD ["npm", "start"]