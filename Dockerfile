# ─── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ─── Runtime stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Copy installed deps (incl. Prisma CLI + generated client) and the build output.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./

EXPOSE 3000

# Apply migrations, optionally backfill ~2 months of demo history, then start.
# Set SEED_DEMO_HISTORY=true once to populate demo data (idempotent; safe to leave on).
CMD ["sh", "-c", "npx prisma migrate deploy && if [ \"$SEED_DEMO_HISTORY\" = \"true\" ]; then node prisma/seed-history.js || true; fi && node dist/main.js"]
