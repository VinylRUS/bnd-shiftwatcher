# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# Табель — кастомный Dockerfile (v3, исправлена доставка Prisma CLI в рантайм).
#
# Стадии:
#   deps    — зависимости ставит bun строго по bun.lock (быстро и воспроизводимо);
#   builder — prisma generate + next build, автономная сборка (.next/standalone);
#   runner  — минимальный рантайм: Next.js standalone + Prisma CLI со ВСЕМИ его
#             зависимостями, чтобы контейнер сам применял миграции при старте.
#
# База (SQLite) живёт в томе /data и переживает пересоздание контейнера.
# Сборка:  docker build -t tabel .
# Запуск:  docker run -p 3000:3000 -v tabel-data:/data tabel
#          (или просто: docker compose up -d --build)
#
# ВАЖНО (для тех, у кого контейнер падал с "Cannot find module
# .../node_modules/prisma/build/index.js"): это старый образ без Prisma CLI.
# Пересоберите без кэша:
#   docker compose down && docker compose build --no-cache && docker compose up -d
# Данные в томе tabel-data при этом не теряются.
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

# ── Prisma CLI для миграций при старте ───────────────────────────────────────
# Next.js standalone кладёт в node_modules только клиент (@prisma/client) —
# сам CLI (node_modules/prisma) в автономную сборку НЕ попадает, поэтому тащим
# его вручную: сам пакет, его скоупы и ПОЛНОЕ замыкание зависимостей
# (prisma@6.19.2 → @prisma/config → c12/effect/…; список проверен скриптом
# scripts/prisma-cli-deps.py и smoke-тестом раннера локально).
COPY --from=builder --chown=tabel:tabel /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=tabel:tabel /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=tabel:tabel /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=tabel:tabel /app/node_modules/@standard-schema ./node_modules/@standard-schema
COPY --from=builder --chown=tabel:tabel \
      /app/node_modules/c12 /app/node_modules/chokidar /app/node_modules/citty \
      /app/node_modules/confbox /app/node_modules/consola /app/node_modules/deepmerge-ts \
      /app/node_modules/defu /app/node_modules/destr /app/node_modules/dotenv \
      /app/node_modules/effect /app/node_modules/empathic /app/node_modules/exsolve \
      /app/node_modules/fast-check /app/node_modules/giget /app/node_modules/jiti \
      /app/node_modules/node-fetch-native /app/node_modules/nypm /app/node_modules/ohash \
      /app/node_modules/pathe /app/node_modules/perfect-debounce /app/node_modules/pkg-types \
      /app/node_modules/pure-rand /app/node_modules/rc9 /app/node_modules/readdirp \
      /app/node_modules/tinyexec /app/node_modules/typescript \
      ./node_modules/

# схема + миграции для prisma migrate deploy
COPY --from=builder --chown=tabel:tabel /app/prisma ./prisma

# ── Страховка: проверяем CLI ПРИ СБОРКЕ ──────────────────────────────────────
# Если после обновления зависимостей какого-то пакета перестанет хватать —
# сборка упадёт здесь с понятной ошибкой, а не контейнер на проде
# в бесконечном цикле перезапуска.
RUN node ./node_modules/prisma/build/index.js --version \
 && node -e "require('./node_modules/.prisma/client'); console.log('prisma client OK')"

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
