# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# Multi-stage Dockerfile — sentinel-admin (Next.js Frontend)
# Stage 1: Dependencies
# Stage 2: Builder → Next.js optimized production build
# Stage 3: Runtime → standalone Next.js server, non-root user
# ─────────────────────────────────────────────────────────────────────────────

# ── STAGE 1: Dependencies ────────────────────────────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts

# ── STAGE 2: Builder ─────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time env (runtime env injected via docker-compose / K8s at startup)
ARG NEXT_PUBLIC_API_URL=http://localhost:3001

ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ── STAGE 3: Runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

# Non-root user
RUN addgroup -g 1001 -S nextjs && \
    adduser -u 1001 -S nextjs -G nextjs

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy Next.js standalone output (must set output: 'standalone' in next.config.ts)
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nextjs /app/public ./public

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/', (r) => process.exit(r.statusCode < 500 ? 0 : 1))"

CMD ["node", "server.js"]
