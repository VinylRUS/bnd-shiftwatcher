# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# Табель — кастомный Dockerfile (v6).
#
# Стадии:
#   deps    — зависимости ставит bun строго по bun.lock (версия запинена);
#   builder — prisma generate + next build → автономная сборка .next/standalone
#             (openssl ставится и здесь — иначе Prisma качает не тот движок);
#   runner  — ТОЛЬКО автономный вывод Next.js + папка prisma со схемой,
#             миграциями и скриптом применения миграций.
#
# ГЛАВНОЕ ОТЛИЧИЕ ОТ ПРЕДЫДУЩИХ ВЕРСИЙ:
#   В рантайме больше НЕТ Prisma CLI. Раньше `prisma migrate deploy`
#   требовал CLI с его зависимостями (effect, c12, consola…) — и их
#   копирование в образ то и дело терялось на билдерах хостингов
#   (ошибки вида "Cannot find module '…/prisma/build/index.js'" и
#   "Cannot find module 'effect'").
#
#   Теперь миграции применяет prisma/migrate.js — маленький скрипт на
#   чистом Node, который работает через УЖЕ СОБРАННЫЙ PrismaClient из
#   автономной сборки. А значит:
#     • нечего дополнительно копировать — нечему теряться;
#     • у миграций и сервера одно условие работоспособности: если сервер
#       вообще способен стартовать, миграции тоже применятся.
#   Формат таблицы _prisma_migrations совпадает с Prisma CLI байт-в-байт
#   (проверено двусторонними тестами), поэтому штатный `prisma migrate
#   deploy` рядом с этим скриптом корректно видит все применённые миграции.
#
# База (SQLite) живёт в томе /data и переживает пересоздание контейнера.
# Сборка:  docker build -t tabel .
# Запуск:  docker run -p 3000:3000 -v tabel-data:/data tabel
#          (или просто: docker compose up -d --build)
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
    HOSTNAME=0.0.0.0
# DATABASE_URL сознательно НЕ задаём: точка входа сама выбирает путь к базе
# (персистентная папка платформы → том /data → рядом с приложением)

# Автономный сервер Next.js: внутри уже есть node_modules с @prisma/client,
# сгенерированным клиентом (.prisma) и движком под эту платформу —
# ровно то, что нужно и серверу, и prisma/migrate.js.
COPY --from=builder --chown=tabel:tabel /app/.next/standalone ./
COPY --from=builder --chown=tabel:tabel /app/.next/static ./.next/static
COPY --from=builder --chown=tabel:tabel /app/public ./public

# схема, миграции и скрипт их применения (включая migrate.js)
COPY --from=builder --chown=tabel:tabel /app/prisma ./prisma

# ── Страховка: полная проверка ПРИ СБОРКЕ тем же путём, что и в рантайме ─────
# Дважды прогоняем prisma/migrate.js по временной базе: первый запуск
# применяет миграции, второй доказывает идемпотентность. Затем проверяем
# PrismaClient. Любая проблема уронит сборку с полным логом — а не контейнер
# на проде в цикле перезапуска.
RUN echo '[verify] миграции (чистая база)…' \
 && DATABASE_URL=file:/tmp/verify.db node ./prisma/migrate.js \
 && echo '[verify] миграции (повторный запуск)…' \
 && DATABASE_URL=file:/tmp/verify.db node ./prisma/migrate.js \
 && echo '[verify] prisma client…' \
 && node -e "require('./node_modules/.prisma/client'); console.log('[verify] client OK')" \
 && rm -f /tmp/verify.db /tmp/verify.db-journal

# точка входа: применить миграции и запустить сервер
COPY --chown=tabel:tabel docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER tabel
VOLUME /data
EXPOSE 3000

# живость проверяем внутренним node (curl/wget в slim-образе нет);
# start-period щедрый — точка входа может ждать досинхронизацию файлов платформы
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# sh — чтобы работало даже если платформа сняла бит исполнения при копировании
ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
CMD ["node", "server.js"]
