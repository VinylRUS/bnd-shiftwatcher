'use client'

// Хранилище Табеля. Раньше данные жили в localStorage браузера — теперь
// они на сервере (SQLite), и стор работает так:
//   1) при загрузке страницы тянем всё состояние с /api/state;
//   2) каждое изменение применяется мгновенно локально (оптимистично)
//      и тут же уходит в базу фоновым запросом;
//   3) при первом запуске пустого сервера автоматически переносим данные
//      из старой локальной версии сайта (ключ tabel-v1);
//   4) активный профиль — настройка конкретного браузера, живёт в localStorage.

import { create } from 'zustand'
import { toast } from 'sonner'
import type { DayEntry, Profile } from '@/lib/tabel'
import { daysInMonth, isoWeekday } from '@/lib/tabel'

const ACTIVE_KEY = 'tabel-active-v1'
const LEGACY_KEY = 'tabel-v1' // старая статическая версия сайта

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function makeProfile(name: string): Profile {
  return {
    id: uid(),
    name: name.trim() || 'Профиль',
    rate: null,
    defStart: '09:00',
    defEnd: '18:00',
    defLunch: true,
    defLunchMin: 60,
    defPlace: 'Склад',
    months: {},
  }
}

export type FillOptions = {
  /** индексы рабочих дней недели, 0 = Пн … 6 = Вс */
  workdays: number[]
  /** true — не трогать уже заполненные дни */
  onlyEmpty: boolean
  start: string
  end: string
  lunch: boolean
  lunchMin: number
  place: string
}

// ─── localStorage-помощники ─────────────────────────────────────────────────

function readStoredActive(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY)
  } catch {
    return null
  }
}

function writeStoredActive(id: string) {
  try {
    localStorage.setItem(ACTIVE_KEY, id)
  } catch {
    /* приватный режим — не критично */
  }
}

/** данные старой версии сайта (persist zustand: { state: { profiles, activeId } }) */
function readLegacy(): { profiles: Profile[]; activeId: string } | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as {
      state?: { profiles?: Profile[]; activeId?: string }
    }
    const all = parsed?.state?.profiles
    if (!Array.isArray(all) || all.length === 0) return null
    const profiles = all.filter(
      (p) =>
        p &&
        typeof p.id === 'string' &&
        typeof p.name === 'string' &&
        p.months &&
        typeof p.months === 'object',
    )
    if (profiles.length === 0) return null
    const activeId =
      parsed.state?.activeId && profiles.some((p) => p.id === parsed.state!.activeId)
        ? parsed.state.activeId
        : profiles[0].id
    return { profiles, activeId }
  } catch {
    return null
  }
}

// ─── запросы к серверу ──────────────────────────────────────────────────────

/** fetch с одним автоповтором (кратковременный обрыв сети не теряет правки) */
async function api(path: string, init?: RequestInit): Promise<Response> {
  const doFetch = () =>
    fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
  let res = await doFetch()
  if (!res.ok) {
    await new Promise((r) => setTimeout(r, 1200))
    res = await doFetch()
  }
  return res
}

function syncFail() {
  toast.error('Не удалось сохранить на сервере', {
    description:
      'Изменение видно только на этом экране. Проверьте соединение и повторите — иначе правка не попадёт в базу.',
  })
}

function throwIfNotOk(res: Response) {
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

function profilePayload(p: Profile) {
  const { months: _months, ...rest } = p
  return rest
}

// ─── стор ───────────────────────────────────────────────────────────────────

type TabelState = {
  profiles: Profile[]
  activeId: string
  /** данные загружены с сервера */
  loaded: boolean
  /** сервер недоступен при загрузке */
  offline: boolean
  load: () => Promise<void>
  setActive: (id: string) => void
  addProfile: (name: string) => Promise<boolean>
  updateProfile: (id: string, patch: Partial<Omit<Profile, 'id' | 'months'>>) => void
  deleteProfile: (id: string) => void
  setDay: (profileId: string, monthKey: string, day: number, entry: DayEntry | null) => void
  clearMonth: (profileId: string, monthKey: string) => void
  /** скопировать записи прошлого месяца; возвращает число перенесённых дней */
  copyMonth: (profileId: string, fromKey: string, toKey: string) => number
  /** заполнить месяц по шаблону; возвращает { work, off } */
  fillMonth: (profileId: string, monthKey: string, opts: FillOptions) => { work: number; off: number }
  /** заменить все данные (восстановление из резервной копии) */
  replaceAll: (data: { profiles: Profile[]; activeId: string }) => Promise<boolean>
}

let inflight: Promise<void> | null = null

/** отложенные PATCH профиля: настройки правятся инпутами, шлём пачкой */
const pendingProfilePatches = new Map<string, Record<string, unknown>>()
const profileTimers = new Map<string, ReturnType<typeof setTimeout>>()

function putMonth(profileId: string, monthKey: string, days: Record<string, DayEntry>) {
  api('/api/month', {
    method: 'PUT',
    body: JSON.stringify({ profileId, monthKey, days }),
  })
    .then(throwIfNotOk)
    .catch(syncFail)
}

export const useTabel = create<TabelState>()((set, get) => ({
  profiles: [],
  activeId: '',
  loaded: false,
  offline: false,

  load: () => {
    if (inflight) return inflight
    set({ offline: false })
    inflight = (async () => {
      try {
        const res = await api('/api/state')
        throwIfNotOk(res)
        const data = (await res.json()) as { profiles?: Profile[] }
        let profiles = Array.isArray(data.profiles) ? data.profiles : []

        if (profiles.length === 0) {
          // первый запуск пустого сервера: переносим данные старой версии, если есть
          const legacy = readLegacy()
          if (legacy) {
            const r = await api('/api/import', {
              method: 'POST',
              body: JSON.stringify({ profiles: legacy.profiles }),
            })
            if (r.ok) {
              set({ profiles: legacy.profiles, activeId: legacy.activeId, loaded: true, offline: false })
              writeStoredActive(legacy.activeId)
              toast.success('Данные перенесены на сервер', {
                description: `Профилей: ${legacy.profiles.length}. Теперь табель общий и не зависит от браузера.`,
              })
              return
            }
          }
          const p = makeProfile('Мой профиль')
          const r = await api('/api/profiles', {
            method: 'POST',
            body: JSON.stringify(profilePayload(p)),
          })
          throwIfNotOk(r)
          set({ profiles: [p], activeId: p.id, loaded: true, offline: false })
          writeStoredActive(p.id)
          return
        }

        const stored = readStoredActive()
        const activeId = stored && profiles.some((p) => p.id === stored) ? stored : profiles[0].id
        set({ profiles, activeId, loaded: true, offline: false })
      } catch (err) {
        console.error('[tabel] загрузка не удалась:', err)
        set({ offline: true })
      } finally {
        inflight = null
      }
    })()
    return inflight
  },

  setActive: (id) => {
    set({ activeId: id })
    writeStoredActive(id)
  },

  addProfile: async (name) => {
    const p = makeProfile(name)
    set((s) => ({ profiles: [...s.profiles, p], activeId: p.id }))
    writeStoredActive(p.id)
    try {
      const res = await api('/api/profiles', {
        method: 'POST',
        body: JSON.stringify(profilePayload(p)),
      })
      throwIfNotOk(res)
      return true
    } catch (err) {
      console.error('[tabel] профиль не создан:', err)
      set((s) => {
        const profiles = s.profiles.filter((x) => x.id !== p.id)
        return {
          profiles,
          activeId: s.activeId === p.id ? (profiles[0]?.id ?? '') : s.activeId,
        }
      })
      syncFail()
      return false
    }
  },

  updateProfile: (id, patch) => {
    set((s) => ({
      profiles: s.profiles.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }))
    const merged = { ...(pendingProfilePatches.get(id) ?? {}), ...patch }
    pendingProfilePatches.set(id, merged)
    clearTimeout(profileTimers.get(id))
    profileTimers.set(
      id,
      setTimeout(() => {
        pendingProfilePatches.delete(id)
        profileTimers.delete(id)
        api(`/api/profiles/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify(merged),
        })
          .then(throwIfNotOk)
          .catch(syncFail)
      }, 600),
    )
  },

  deleteProfile: (id) => {
    let removed: Profile | undefined
    set((s) => {
      if (s.profiles.length <= 1) return s
      removed = s.profiles.find((p) => p.id === id)
      const profiles = s.profiles.filter((p) => p.id !== id)
      return {
        profiles,
        activeId: s.activeId === id ? profiles[0].id : s.activeId,
      }
    })
    if (!removed) return
    writeStoredActive(get().activeId)
    api(`/api/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' })
      .then(throwIfNotOk)
      .catch(syncFail)
  },

  setDay: (profileId, key, day, entry) => {
    set((s) => ({
      profiles: s.profiles.map((p) => {
        if (p.id !== profileId) return p
        const month = { ...(p.months[key] ?? {}) }
        if (entry === null) delete month[String(day)]
        else month[String(day)] = entry
        return { ...p, months: { ...p.months, [key]: month } }
      }),
    }))
    api('/api/day', {
      method: 'PUT',
      body: JSON.stringify({
        profileId,
        date: `${key}-${String(day).padStart(2, '0')}`,
        entry,
      }),
    })
      .then(throwIfNotOk)
      .catch(syncFail)
  },

  clearMonth: (profileId, key) => {
    set((s) => ({
      profiles: s.profiles.map((p) => {
        if (p.id !== profileId) return p
        const months = { ...p.months }
        delete months[key]
        return { ...p, months }
      }),
    }))
    putMonth(profileId, key, {})
  },

  copyMonth: (profileId, fromKey, toKey) => {
    const p = get().profiles.find((x) => x.id === profileId)
    if (!p) return 0
    const from = p.months[fromKey] ?? {}
    const [y, m] = toKey.split('-').map(Number)
    const dim = daysInMonth(y, m - 1)
    const target: Record<string, DayEntry> = {}
    let n = 0
    for (let d = 1; d <= dim; d++) {
      const e = from[String(d)]
      if (e) {
        target[String(d)] = { ...e }
        n++
      }
    }
    if (n > 0) {
      set((s) => ({
        profiles: s.profiles.map((x) =>
          x.id === profileId ? { ...x, months: { ...x.months, [toKey]: target } } : x,
        ),
      }))
      putMonth(profileId, toKey, target)
    }
    return n
  },

  fillMonth: (profileId, key, opts) => {
    const [y, m] = key.split('-').map(Number)
    const dim = daysInMonth(y, m - 1)
    const work = new Set(opts.workdays)
    const p = get().profiles.find((x) => x.id === profileId)
    const existing = p?.months[key] ?? {}
    const target: Record<string, DayEntry> = opts.onlyEmpty ? { ...existing } : {}
    let nWork = 0
    let nOff = 0
    for (let d = 1; d <= dim; d++) {
      if (opts.onlyEmpty && existing[String(d)]) continue
      const wd = isoWeekday(new Date(y, m - 1, d))
      if (work.has(wd)) {
        target[String(d)] = {
          off: false,
          start: opts.start,
          end: opts.end,
          lunch: opts.lunch,
          lunchMin: opts.lunchMin,
          place: opts.place.trim(),
        }
        nWork++
      } else {
        target[String(d)] = {
          off: true,
          start: '',
          end: '',
          lunch: false,
          lunchMin: 0,
          place: '',
        }
        nOff++
      }
    }
    set((s) => ({
      profiles: s.profiles.map((x) =>
        x.id === profileId ? { ...x, months: { ...x.months, [key]: target } } : x,
      ),
    }))
    putMonth(profileId, key, target)
    return { work: nWork, off: nOff }
  },

  replaceAll: async (data) => {
    if (!Array.isArray(data.profiles) || data.profiles.length === 0) return false
    const activeId = data.profiles.some((p) => p.id === data.activeId)
      ? data.activeId
      : data.profiles[0].id
    try {
      const res = await api('/api/import', {
        method: 'POST',
        body: JSON.stringify({ profiles: data.profiles }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        toast.error('Не удалось восстановить копию', {
          description: j.error ?? `Ошибка ${res.status}`,
        })
        return false
      }
      set({ profiles: data.profiles, activeId })
      writeStoredActive(activeId)
      return true
    } catch (err) {
      console.error('[tabel] восстановление не удалось:', err)
      syncFail()
      return false
    }
  },
}))
