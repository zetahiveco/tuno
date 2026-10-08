# syntax=docker/dockerfile:1

# ---------- Build stage ----------
FROM oven/bun:1 AS build
WORKDIR /app

# Install dependencies first (cached layer)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source and build (Prisma clients + Tailwind CSS + React client bundle)
COPY . .
# prisma.config.ts resolves DATABASE_URL when loaded, but generate makes no DB
# connection — a placeholder is enough (real value is provided at runtime)
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" bun run prisma:generate
RUN bun run build

# Remove dev dependencies for a smaller runtime image
RUN bun install --production --frozen-lockfile

# ---------- Runtime stage ----------
FROM oven/bun:1-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=5000

# Copy the built application (source + generated Prisma clients + node_modules + public assets)
COPY --from=build /app /app

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "const r = await fetch('http://127.0.0.1:' + (process.env.PORT ?? 5000) + '/api/health'); if (!r.ok) process.exit(1)"

# Push Prisma schemas (idempotent: creates the database + Postgres schemas if missing) then start
CMD ["sh", "-c", "bun scripts/database.ts push && exec bun main.ts"]