# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# Табель — кастомный Dockerfile (v8; стадии те же, что в v7,
# зависимости почищены: 827 → 486 пакетов — сборка влезает в диск билдера).
#
# Стадии:
#   deps    — зависимости ставит bun строго по bun.lock (версия запинена);
#   builder — prisma generate + next build → автономная сборка .next/standalone;
#   runner  — только автономный вывод Next.js + prisma, всё в /srv/tabel.
#
# ГЛАВНОЕ (v7): приложение живёт в /srv/tabel — ВНЕ /app.
#   Документация bothost («Кастомный Dockerfile»): при запуске контейнера
#   платформа монтирует в /app исходники из Git, и всё, что образ положил
#   в /app, скрыто этим монтированием; их же рекомендация — класть
#   артефакты вне /app (в примерах — /usr/local/bin).
#
#   Поэтому рантайм вообще не зависит от /app: не ждём «досинхронизации»
#   файлов (гонки v6 исчезли), не держим fallback-копию сборки в репо.
#   База — /app/data (персистентная папка платформы по их документации),
#   при обычном docker compose — том /data.
#
# Миграции (как в v5/v6): prisma/migrate.js через уже собранный PrismaClient
# из автономной сборки — Prisma CLI в рантайме не нужен. Таблица
# _prisma_migrations ведётся в формате CLI, так что штатный
# `prisma migrate deploy` видит эти миграции применёнными.
#
# Сборка:  docker build -t tabel .
# Запуск:  docker run -p 3000:3000 tabel   (или: docker compose up -d --build)
# ─────────────────────────────────────────────────────────────────────────────

# ─── 1/3 · зависимости ───────────────────────────────────────────────────────
# версия bun запинена ради воспроизводимости
FROM oven/bun:1.4.4 AS deps
WORKDIR /app
COPY package.json bun.lock ./
# схема нужна постинстоллу @prisma/client (prisma generate)
COPY prisma ./prisma
RUN bun install --frozen-lockfile

# ─── 2/3 · сборка ────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder
WORKDIR /app
# openssl нужен на этапе prisma generate: без него Prisma не может определить
# версию libssl и скачивает движок под openssl-1.1.x, а рантайм у нас на 3.0.x
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1
# На этапе сборки Prisma-клиенту достаточно любого валидного пути —
# настоящая база подключается в рантайме.
ENV DATABASE_URL="file:/tmp/build.db"
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate \
 && npx next build

# ─── 3/3 · рантайм ───────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner
# openssl — зависимость Prisma-движков в Debian
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# DATABASE_URL сознательно НЕ задаём: точка входа сама выберет путь к базе
# (/app/data платформы → том /data → рядом с приложением)

# ── приложение целиком ВНЕ /app: на bothost /app скрыт git-монтированием ─────
# Внутри автономной сборки уже есть node_modules с @prisma/client,
# сгенерированным клиентом (.prisma) и движком под эту платформу.
COPY --from=builder /app/.next/standalone /srv/tabel
COPY --from=builder /app/.next/static /srv/tabel/.next/static
COPY --from=builder /app/public /srv/tabel/public
COPY --from=builder /app/prisma /srv/tabel/prisma

# ── Страховка: полная проверка ПРИ СБОРКЕ тем же путём, что и в рантайме ─────
# Дважды прогоняем prisma/migrate.js по временной базе: первый запуск
# применяет миграции, второй доказывает идемпотентность. Затем проверяем
# PrismaClient. Любая проблема уронит сборку с полным логом — а не контейнер
# на проде в цикле перезапуска.
RUN echo '[verify] миграции (чистая база)…' \
 && DATABASE_URL=file:/tmp/verify.db node /srv/tabel/prisma/migrate.js \
 && echo '[verify] миграции (повторный запуск)…' \
 && DATABASE_URL=file:/tmp/verify.db node /srv/tabel/prisma/migrate.js \
 && echo '[verify] prisma client…' \
 && node -e "require('/srv/tabel/node_modules/.prisma/client'); console.log('[verify] client OK')" \
 && rm -f /tmp/verify.db /tmp/verify.db-journal

# точка входа: применить миграции и запустить сервер.
# sh — чтобы работало даже если платформа снимет бит исполнения при копировании.
COPY docker-entrypoint.sh /srv/tabel/docker-entrypoint.sh
RUN chmod +x /srv/tabel/docker-entrypoint.sh

WORKDIR /srv/tabel
EXPOSE 3000

# живость проверяем внутренним node (curl/wget в slim-образе нет);
# start-period короткий: ждать больше нечего, старт почти мгновенный
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["sh", "/srv/tabel/docker-entrypoint.sh"]
CMD ["node", "server.js"]
