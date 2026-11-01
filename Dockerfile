# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# Табель — кастомный Dockerfile.
#
# Три стадии:
#   deps    — зависимости ставит bun строго по bun.lock (быстро и воспроизводимо);
#   builder — prisma generate + next build, автономная сборка (.next/standalone);
#   runner  — минимальный рантайм: Next.js standalone + Prisma CLI для миграций.
#
# База (SQLite) живёт в томе /data и переживает пересоздание контейнера.
# Сборка:  docker build -t tabel .
# Запуск:  docker run -p 3000:3000 -v tabel-data:/data tabel
#          (или просто: docker compose up -d)
# ─────────────────────────────────────────────────────────────────────────────

# ─── 1/3 · зависимости ───────────────────────────────────────────────────────
# oven/bun — дебиан-образ, та же платформа (glibc/openssl 3), что и у рантайма,
# поэтому скачанные Prisma-движки подойдут и для node:22-bookworm-slim.
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
# схема нужна постинстоллу @prisma/client (prisma generate)
COPY prisma ./prisma
RUN bun install --frozen-lockfile

# ─── 2/3 · сборка ────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# На этапе сборки Prisma-клиенту достаточно любого валидного пути —
# настоящая база подключается в рантайме через том /data.
ENV DATABASE_URL="file:/tmp/build.db"
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate \
 && npx next build

# ─── 3/3 · рантайм ───────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner
WORKDIR /app

# openssl — зависимость Prisma-движков в Debian
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --gid 1001 tabel \
 && useradd --uid 1001 --gid tabel --create-home tabel \
 && mkdir -p /data \
 && chown -R tabel:tabel /data

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL="file:/data/tabel.db"

# автономный сервер Next.js + статика и публичные файлы
COPY --from=builder --chown=tabel:tabel /app/.next/standalone ./
COPY --from=builder --chown=tabel:tabel /app/.next/static ./.next/static
COPY --from=builder --chown=tabel:tabel /app/public ./public

# Prisma CLI, движки и миграции — чтобы контейнер сам создавал/обновлял схему БД
COPY --from=builder --chown=tabel:tabel /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=tabel:tabel /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=tabel:tabel /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=tabel:tabel /app/prisma ./prisma

# точка входа: применить миграции и запустить сервер
COPY --chown=tabel:tabel docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER tabel
VOLUME /data
EXPOSE 3000

# живость проверяем внутренним node (curl/wget в slim-образе нет)
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
