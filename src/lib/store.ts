'use client'

// Хранилище Табеля (v9 — с авторизацией по пинкоду).
//
//   • вход в профиль: 6-значный пин; пока пин не установлен — первый вход
//     по имени, после которого сразу задаётся пин (/api/auth/*);
//   • после входа сессия живёт в httpOnly-cookie, /api/state отдаёт
//     ТОЛЬКО свой профиль (месяцы) + список профилей для админа;
//   • правки дня/месяца применяются мгновенно локально (оптимистично)
//     и тут же уходят в базу фоновым запросом — как и раньше;
//   • активный профиль = профиль сессии, в localStorage больше ничего
//     не храним.

import { create } from 'zustand'
import { toast } from 'sonner'
import type { DayEntry, Profile } from '@/lib/tabel'
import { daysInMonth, halfRange, isoWeekday } from '@/lib/tabel'

/** профиль в списке админа (без месяцев) */
export type AdminProfile = {
  id: string
  name: string
  hasPin: boolean
  rate: number | null
  defStart: string
  defEnd: string
  defLunch: boolean
  defLunchMin: number
  defPlace: string
}

export type ApiResult = { ok: boolean; error?: string; code?: string; needPin?: boolean }

export type FillOptions = {
  /** индексы рабочих дней недели, 0 = Пн … 6 = Вс */
  workdays: number[]
  /** true — не трогать уже заполненные дни */
  onlyEmpty: boolean
  /** что заполнить: весь месяц (по умолчанию) или половина (1–15 / 16–конец) */
  scope?: 'month' | 'first' | 'second'
  start: string
  end: string
  lunch: boolean
  lunchMin: number
  place: string
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
  if (!res.ok && res.status >= 500) {
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

/** POST/DELETE с человеческой ошибкой в ответе */
async function call(path: string, method: string, body?: unknown): Promise<ApiResult> {
  try {
    const res = await api(path, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      error?: string
      code?: string
      needPin?: boolean
    }
    if (!res.ok) return { ok: false, error: data.error ?? `Ошибка ${res.status}`, code: data.code }
    return { ok: true, needPin: data.needPin }
  } catch {
    return { ok: false, error: 'Сервер недоступен — проверьте соединение' }
  }
}

// ─── стор ───────────────────────────────────────────────────────────────────

type TabelState = {
  /** первый запрос /api/state завершён */
  booted: boolean
  /** есть сессия (вход выполнен) */
  authed: boolean
  /** свой профиль (с месяцами) */
  me: Profile | null
  isAdmin: boolean
  /** список профилей — только для админа */
  adminProfiles: AdminProfile[]
  /** на сервере нет ни одного профиля → создание админа */
  firstRun: boolean
  /** сервер недоступен */
  serverDown: boolean

  load: () => Promise<void>

  // вход/выход
  loginByPin: (pin: string) => Promise<ApiResult>
  loginByName: (name: string) => Promise<ApiResult>
  setupFirst: (name: string) => Promise<ApiResult>
  setPinFor: (name: string, pin: string) => Promise<ApiResult>
  changeOwnPin: (currentPin: string, newPin: string) => Promise<ApiResult>
  logout: () => Promise<void>
  /** открыть профиль по пину (переключение админом) */
  openProfile: (id: string, pin: string) => Promise<ApiResult>

  // управление профилями (админ)
  createProfile: (name: string) => Promise<ApiResult>
  adminUpdateProfile: (id: string, patch: Partial<Omit<AdminProfile, 'id' | 'hasPin'>>) => void
  deleteProfile: (id: string) => Promise<ApiResult>
  setProfilePin: (id: string, pin: string | null) => Promise<ApiResult>
  refreshAdminProfiles: () => Promise<void>

  // свои настройки (оптимистично, патч пачкой)
  updateProfile: (id: string, patch: Partial<Omit<Profile, 'id' | 'months'>>) => void

  // записи дней (свой профиль)
  setDay: (profileId: string, monthKey: string, day: number, entry: DayEntry | null) => void
  clearMonth: (profileId: string, monthKey: string) => void
  /** скопировать записи прошлого месяца; возвращает число перенесённых дней */
  copyMonth: (profileId: string, fromKey: string, toKey: string) => number
  /** заполнить месяц или половину по шаблону; возвращает { work, off } */
  fillMonth: (
    profileId: string,
    monthKey: string,
    opts: FillOptions,
  ) => { work: number; off: number }

  /** заменить все данные (восстановление из копии, админ) */
  replaceAll: (data: { profiles: Profile[] }) => Promise<boolean>
}

/** отложенные PATCH своего профиля: настройки правятся инпутами, шлём пачкой */
const pendingProfilePatches = new Map<string, Record<string, unknown>>()
const profileTimers = new Map<string, ReturnType<typeof setTimeout>>()

/** отложенные PATCH чужого профиля (правки админом в диалоге профилей) */
const pendingAdminPatches = new Map<string, Record<string, unknown>>()
const adminTimers = new Map<string, ReturnType<typeof setTimeout>>()

function putMonth(profileId: string, monthKey: string, days: Record<string, DayEntry>) {
  api('/api/month', {
    method: 'PUT',
    body: JSON.stringify({ profileId, monthKey, days }),
  })
    .then(throwIfNotOk)
    .catch(syncFail)
}

export const useTabel = create<TabelState>()((set, get) => ({
  booted: false,
  authed: false,
  me: null,
  isAdmin: false,
  adminProfiles: [],
  firstRun: false,
  serverDown: false,

  // ─── загрузка состояния ───────────────────────────────────────────────────
  load: async () => {
    try {
      const res = await api('/api/state')
      if (res.status === 401) {
        // нет сессии: первый запуск или экран входа
        let firstRun = false
        try {
          const rs = await api('/api/auth/state')
          if (rs.ok) firstRun = !((await rs.json()) as { hasProfiles?: boolean }).hasProfiles
        } catch {
          /* не критично */
        }
        set({
          authed: false,
          me: null,
          isAdmin: false,
          adminProfiles: [],
          firstRun,
          booted: true,
          serverDown: false,
        })
        return
      }
      throwIfNotOk(res)
      const data = (await res.json()) as {
        profile?: Profile
        isAdmin?: boolean
        profiles?: AdminProfile[] | null
      }
      if (!data.profile) throw new Error('нет профиля в ответе')
      set({
        authed: true,
        me: data.profile,
        isAdmin: !!data.isAdmin,
        adminProfiles: data.profiles ?? [],
        firstRun: false,
        booted: true,
        serverDown: false,
      })
    } catch (err) {
      console.error('[tabel] загрузка не удалась:', err)
      set({ serverDown: true, booted: true })
    }
  },

  // ─── вход / выход ─────────────────────────────────────────────────────────
  loginByPin: async (pin) => {
    const r = await call('/api/auth/login', 'POST', { pin })
    if (r.ok) await get().load()
    return r
  },

  loginByName: async (name) => {
    return call('/api/auth/login', 'POST', { name })
  },

  setupFirst: async (name) => {
    return call('/api/auth/setup', 'POST', { name })
  },

  setPinFor: async (name, pin) => {
    const r = await call('/api/auth/set-pin', 'POST', { name, pin })
    if (r.ok) await get().load()
    return r
  },

  changeOwnPin: async (currentPin, newPin) => {
    const r = await call('/api/auth/pin', 'POST', { currentPin, newPin })
    if (r.ok) {
      toast.success('Пинкод изменён', {
        description: 'На других устройствах попросят ввести новый пинкод.',
      })
    }
    return r
  },

  logout: async () => {
    await call('/api/auth/logout', 'POST')
    set({ authed: false, me: null, isAdmin: false, adminProfiles: [], firstRun: false })
  },

  openProfile: async (id, pin) => {
    const r = await call('/api/auth/login', 'POST', { profileId: id, pin })
    if (r.ok) await get().load()
    return r
  },

  // ─── управление профилями (админ) ─────────────────────────────────────────
  createProfile: async (name) => {
    const r = await call('/api/profiles', 'POST', { name })
    if (r.ok) await get().refreshAdminProfiles()
    return r
  },

  adminUpdateProfile: (id, patch) => {
    set((s) => ({
      adminProfiles: s.adminProfiles.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }))
    const merged = { ...(pendingAdminPatches.get(id) ?? {}), ...patch }
    pendingAdminPatches.set(id, merged)
    clearTimeout(adminTimers.get(id))
    adminTimers.set(
      id,
      setTimeout(() => {
        pendingAdminPatches.delete(id)
        adminTimers.delete(id)
        api(`/api/profiles/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify(merged),
        })
          .then(throwIfNotOk)
          .catch(syncFail)
      }, 600),
    )
  },

  deleteProfile: async (id) => {
    const r = await call(`/api/profiles/${encodeURIComponent(id)}`, 'DELETE')
    if (r.ok) await get().refreshAdminProfiles()
    return r
  },

  setProfilePin: async (id, pin) => {
    const r = await call(`/api/profiles/${encodeURIComponent(id)}/pin`, 'POST', { pin })
    if (r.ok) await get().refreshAdminProfiles()
    return r
  },

  refreshAdminProfiles: async () => {
    await get().load()
  },

  // ─── свои настройки ───────────────────────────────────────────────────────
  updateProfile: (id, patch) => {
    set((s) => (s.me && s.me.id === id ? { me: { ...s.me, ...patch } } : s))
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

  // ─── записи дней ──────────────────────────────────────────────────────────
  setDay: (profileId, key, day, entry) => {
    set((s) => {
      if (!s.me || s.me.id !== profileId) return s
      const month = { ...(s.me.months[key] ?? {}) }
      if (entry === null) delete month[String(day)]
      else month[String(day)] = entry
      return { me: { ...s.me, months: { ...s.me.months, [key]: month } } }
    })
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
    set((s) => {
      if (!s.me || s.me.id !== profileId) return s
      const months = { ...s.me.months }
      delete months[key]
      return { me: { ...s.me, months } }
    })
    putMonth(profileId, key, {})
  },

  copyMonth: (profileId, fromKey, toKey) => {
    const p = get().me
    if (!p || p.id !== profileId) return 0
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
      set((s) =>
        s.me && s.me.id === profileId
          ? { me: { ...s.me, months: { ...s.me.months, [toKey]: target } } }
          : s,
      )
      putMonth(profileId, toKey, target)
    }
    return n
  },

  fillMonth: (profileId, key, opts) => {
    const [y, m] = key.split('-').map(Number)
    const dim = daysInMonth(y, m - 1)
    const scope = opts.scope ?? 'month'
    const { from, to } =
      scope === 'month' ? { from: 1, to: dim } : halfRange(scope === 'second' ? 2 : 1, y, m - 1)
    const work = new Set(opts.workdays)
    const p = get().me
    const existing = p?.months[key] ?? {}
    // дни вне выбранного периода не трогаем — переносим в результат как есть
    const target: Record<string, DayEntry> = {}
    for (let d = 1; d < from; d++) {
      const e = existing[String(d)]
      if (e) target[String(d)] = e
    }
    for (let d = to + 1; d <= dim; d++) {
      const e = existing[String(d)]
      if (e) target[String(d)] = e
    }
    let nWork = 0
    let nOff = 0
    for (let d = from; d <= to; d++) {
      if (opts.onlyEmpty && existing[String(d)]) {
        target[String(d)] = existing[String(d)]
        continue
      }
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
    set((s) =>
      s.me && s.me.id === profileId
        ? { me: { ...s.me, months: { ...s.me.months, [key]: target } } }
        : s,
    )
    putMonth(profileId, key, target)
    return { work: nWork, off: nOff }
  },

  replaceAll: async (data) => {
    if (!Array.isArray(data.profiles) || data.profiles.length === 0) return false
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
      // свои данные могли смениться (или сессия слетела) — перезагружаем
      await get().load()
      return true
    } catch (err) {
      console.error('[tabel] восстановление не удалось:', err)
      syncFail()
      return false
    }
  },
}))
