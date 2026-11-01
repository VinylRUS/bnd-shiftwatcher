#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Табель — применение миграций БЕЗ Prisma CLI (prisma/migrate.js).
//
// Зачем это нужно:
//   `prisma migrate deploy` — это CLI-программа со своими десятками
//   зависимостей (effect, c12, consola…), которые в автономном образе
//   Next.js (.next/standalone) отсутствуют и при ручном докопировании
//   терялись на некоторых билдерах. Этот скрипт делает то же самое,
//   но средствами УЖЕ СОБРАННОГО PrismaClient: он лежит в образе и без
//   него всё равно не запустится сам сервер. У миграций и сервера теперь
//   одно общее условие работоспособности — терять больше нечему.
//
// Что делает:
//   • читает prisma/migrations/*/migration.sql (по порядку имён папок);
//   • ведёт таблицу _prisma_migrations — в том же формате, что и
//     настоящий Prisma CLI (включая sha256-сумму миграции), поэтому
//     штатный `prisma migrate deploy` потом корректно увидит эти
//     миграции как применённые и не будет делать ничего повторно;
//   • применяет только неприменённые — запуск сколько угодно раз безопасен.
//
// Запуск: DATABASE_URL=file:/путь/к/базе.db node prisma/migrate.js
//
// Ограничение: разбор SQL на инструкции простой (учитываются кавычки
// и комментарии; ';' внутри тел триггеров не поддерживается) — для
// миграций этого проекта этого достаточно.
// ─────────────────────────────────────────────────────────────────────────────
'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

// ── PrismaClient: сначала пакет, затем напрямую сгенерированный клиент ──────
function loadClient() {
  try {
    return require('@prisma/client')
  } catch {
    // запасной путь: сгенерированный клиент без обёртки @prisma/client
    return require(path.join(__dirname, '..', 'node_modules', '.prisma', 'client'))
  }
}

// ── пустой файл базы, если его ещё нет (0 байт = валидная пустая SQLite) ─────
function ensureDbFile(url) {
  const m = /^file:(.+)$/.exec(url || '')
  if (!m) return
  const p = m[1].split('?')[0]
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true })
    if (!fs.existsSync(p)) fs.writeFileSync(p, '')
  } catch (err) {
    console.error(`[tabel] не могу подготовить файл базы ${p}: ${err.message}`)
  }
}

// ── разбор SQL на инструкции: уважаем кавычки и комментарии ─────────────────
function splitSql(sql) {
  const stmts = []
  let cur = ''
  let inSingle = false
  let inDouble = false
  let inBacktick = false
  let inLineComment = false
  let inBlockComment = false

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i]
    const n = sql[i + 1]

    if (inLineComment) {
      cur += c
      if (c === '\n') inLineComment = false
      continue
    }
    if (inBlockComment) {
      cur += c
      if (c === '*' && n === '/') {
        cur += n
        i++
        inBlockComment = false
      }
      continue
    }

    if (!inSingle && !inDouble && !inBacktick) {
      if (c === '-' && n === '-') {
        inLineComment = true
        cur += c
        continue
      }
      if (c === '/' && n === '*') {
        inBlockComment = true
        cur += c
        continue
      }
      if (c === "'") inSingle = true
      else if (c === '"') inDouble = true
      else if (c === '`') inBacktick = true
    } else if (inSingle && c === "'") {
      if (n === "'") {
        cur += c + n
        i++
        continue
      }
      inSingle = false
    } else if (inDouble && c === '"') {
      if (n === '"') {
        cur += c + n
        i++
        continue
      }
      inDouble = false
    } else if (inBacktick && c === '`') {
      inBacktick = false
    }

    if (c === ';' && !inSingle && !inDouble && !inBacktick) {
      stmts.push(cur)
      cur = ''
    } else {
      cur += c
    }
  }
  if (cur.trim()) stmts.push(cur)

  // выкидываем пустые/только-комментарии инструкции
  return stmts
    .map((s) => s.trim())
    .filter((s) => {
      const noComments = s
        .replace(/--[^\n]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/[\s;]/g, '')
      return noComments.length > 0
    })
}

// ── основная логика ──────────────────────────────────────────────────────────
async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('[tabel] ОШИБКА: не задана переменная DATABASE_URL')
    process.exit(1)
  }
  ensureDbFile(url)

  const { PrismaClient } = loadClient()
  const prisma = new PrismaClient({ log: ['warn', 'error'] })

  try {
    // таблица учёта миграций — DDL байт-в-байт как у Prisma CLI
    // (ВАЖНО: именно DATETIME, не DATETIME(3) — движок схемы Prisma
    // падает на непривычном типе при чтении таблицы)
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
          "id"                    TEXT PRIMARY KEY NOT NULL,
          "checksum"             TEXT NOT NULL,
          "finished_at"          DATETIME,
          "migration_name"       TEXT NOT NULL,
          "logs"                 TEXT,
          "rolled_back_at"       DATETIME,
          "started_at"           DATETIME NOT NULL DEFAULT current_timestamp,
          "applied_steps_count"  INTEGER UNSIGNED NOT NULL DEFAULT 0
      )
    `)

    const migrationsDir = path.join(__dirname, 'migrations')
    if (!fs.existsSync(migrationsDir)) {
      console.log('[tabel] папки миграций нет — считать нечего, пропускаю')
      return
    }

    const names = fs
      .readdirSync(migrationsDir)
      .filter((name) => {
        const dir = path.join(migrationsDir, name)
        return (
          /^\d/.test(name) &&
          fs.statSync(dir).isDirectory() &&
          fs.existsSync(path.join(dir, 'migration.sql'))
        )
      })
      .sort()

    const appliedRows = await prisma.$queryRawUnsafe(
      `SELECT "migration_name" FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL`,
    )
    const applied = new Set(appliedRows.map((r) => r.migration_name))

    let done = 0
    for (const name of names) {
      if (applied.has(name)) continue
      const sqlPath = path.join(migrationsDir, name, 'migration.sql')
      const sql = fs.readFileSync(sqlPath, 'utf8')
      const checksum = crypto.createHash('sha256').update(sql).digest('hex')

      console.log(`[tabel] применяю миграцию ${name}…`)
      for (const stmt of splitSql(sql)) {
        await prisma.$executeRawUnsafe(stmt)
      }
      // запись в том же виде, что пишет Prisma CLI
      // (ISO-строка с миллисекундами, applied_steps_count = 1)
      const now = new Date().toISOString()
      await prisma.$executeRaw`
        INSERT INTO "_prisma_migrations"
          ("id", "checksum", "finished_at", "migration_name", "logs",
           "rolled_back_at", "started_at", "applied_steps_count")
        VALUES (${crypto.randomUUID()}, ${checksum}, ${now}, ${name},
                NULL, NULL, ${now}, 1)
      `
      done++
      console.log(`[tabel] миграция ${name} применена`)
    }

    console.log(
      done === 0
        ? '[tabel] новых миграций нет — схема актуальна'
        : `[tabel] применено миграций: ${done}`,
    )
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error('[tabel] ОШИБКА применения миграций:')
  console.error(err && err.stack ? err.stack : String(err))
  process.exit(1)
})
