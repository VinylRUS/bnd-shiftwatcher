# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# Табель — кастомный Dockerfile (v4).
#
# Стадии:
#   deps    — зависимости ставит bun строго по bun.lock (версия запинена);
#   builder — prisma generate + next build (.next/standalone) + отдельное
#             npm-дерево с Prisma CLI для миграций;
#   runner  — рантайм: Next.js standalone + npm-дерево Prisma CLI.
#
# ПОЧЕМУ CLI СТАВИТСЯ ОТДЕЛЬНЫМ npm-ДЕРЕВОМ (v3 → v4):
#   Standalone-сборка Next.js кладёт в образ только @prisma/client, а самому
#   `prisma migrate deploy` нужен CLI со своими зависимостями (effect, c12…).
#   В v3 эти пакеты копировались списком из bun-раскладки — и на некоторых
#   билдерах (классический docker builder) список терялся. Теперь CLI
#   ставится npm-ом в отдельную папку как самодостаточное дерево (реальные
#   файлы, классическая hoisted-раскладка) и копируется ОДНОЙ строкой COPY.
#   npm-дерево гарантированно резолвится node-ом, а движки скачиваются
#   прямо под платформу рантайма (node:22-bookworm-slim).
#
# База (SQLite) живёт в томе /data и переживает пересоздание контейнера.
# Сборка:  docker build -t tabel .
# Запуск:  docker run -p 3000:3000 -v tabel-data:/data tabel
#          (или просто: docker compose up -d --build)
# ─────────────────────────────────────────────────────────────────────────────

# ─── 1/3 · зависимости ───────────────────────────────────────────────────────
# версия bun запинена ради воспроизводимости (плавающий тег :1 может
# изменить поведение установки)
FROM oven/bun:1.4.4 AS deps
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
 && npx next build \
# ── отдельное npm-дерево с Prisma CLI (для миграций при старте) ────────────
# версия читается из установленного дерева, так что CLI всегда совпадает
# с @prisma/client из bun.lock
 && PRISMA_VER="$(node -p "require('./node_modules/prisma/package.json').version")" \
 && echo "prisma CLI: ${PRISMA_VER}" \
 && mkdir -p /cli \
 && printf '{"name":"prisma-cli","private":true}' > /cli/package.json \
 && cd /cli \
 && npm install --no-audit --no-fund --loglevel=error "prisma@${PRISMA_VER}" \
 && node /cli/node_modules/prisma/build/index.js --version

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

# автономный сервер Next.js: внутри уже есть node_modules с @prisma/client
# и сгенерированным клиентом (.prisma) с движком под эту платформу
COPY --from=builder --chown=tabel:tabel /app/.next/standalone ./
COPY --from=builder --chown=tabel:tabel /app/.next/static ./.next/static
COPY --from=builder --chown=tabel:tabel /app/public ./public

# Prisma CLI со всеми зависимостями — ОДИН COPY целого самодостаточного
# npm-дерева (содержимое /cli/node_modules вливается в ./node_modules)
COPY --from=builder --chown=tabel:tabel /cli/node_modules ./node_modules

# схема + миграции для prisma migrate deploy
COPY --from=builder --chown=tabel:tabel /app/prisma ./prisma

# ── Страховка: полная проверка ПРИ СБОРКЕ ────────────────────────────────────
# Прогоняем настоящий migrate deploy по временной базе и требуем клиента.
# Если что-то не так — сборка упадёт здесь с полным логом Prisma,
# а не контейнер на проде в цикле перезапуска.
RUN echo '[verify] prisma migrate deploy…' \
 && DATABASE_URL=file:/tmp/verify.db \
    node ./node_modules/prisma/build/index.js migrate deploy --schema ./prisma/schema.prisma \
 && echo '[verify] prisma client…' \
 && node -e "require('./node_modules/.prisma/client'); console.log('[verify] client OK')" \
 && rm -f /tmp/verify.db /tmp/verify.db-journal

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
