# Stage 1: Build frontend (Vue/Vite) - unchanged
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json .
RUN npm install
COPY . .
RUN npm run build

# Stage 1b: Build the public home page (landing/, a Next.js static export to
# landing/out, served by the server at "/"). Next 16 needs Node >= 20.9.
FROM node:22-alpine AS landing

WORKDIR /landing
# Wait for the app build above before starting: Docker would otherwise run
# both builds at the same time, too much for a 2 GB VPS.
COPY --from=builder /app/package.json /tmp/app-built
COPY landing/package*.json ./
RUN npm install --no-audit --no-fund
COPY landing/ ./
# Optional public address for link previews (og:image), e.g. https://example.gr
ARG SITE_URL
ENV SITE_URL=$SITE_URL NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Stage 2: Runtime (slim, prod-only)
FROM node:20-alpine

WORKDIR /app

# Install prod deps FIRST (as root → safe & fast)
COPY package*.json .
RUN npm install --production --no-audit --no-fund   # optional flags speed it up a bit

# NOW copy built stuff
COPY --from=builder /app/client/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=landing /landing/out ./landing/out

# Create non-root user and switch (AFTER npm install!)
RUN addgroup -g 1001 nodejs && \
    adduser -S -u 1001 -G nodejs nextuser && \
    chown -R nextuser:nodejs /app

USER nextuser

EXPOSE 3000

CMD ["npm", "start"]