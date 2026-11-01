'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CloudOff,
  History,
  MoreHorizontal,
  RotateCcw,
  Trash2,
  Wand2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { HeaderBar } from '@/components/tabel/header-bar'
import { ProfileDialog } from '@/components/tabel/profile-dialog'
import { FillDialog } from '@/components/tabel/fill-dialog'
import { DayEditDialog } from '@/components/tabel/day-edit-dialog'
import { DayList } from '@/components/tabel/day-list'
import { StatsPanel } from '@/components/tabel/stats-panel'
import { ExportCard } from '@/components/tabel/export-card'
import { useTabel, type FillOptions } from '@/lib/store'
import type { DayEntry } from '@/lib/tabel'
import { MONTHS_RU, monthKey } from '@/lib/tabel'

export default function Home() {
  const profiles = useTabel((s) => s.profiles)
  const loaded = useTabel((s) => s.loaded)
  const offline = useTabel((s) => s.offline)
  const load = useTabel((s) => s.load)
  const activeId = useTabel((s) => s.activeId)
  const setActive = useTabel((s) => s.setActive)
  const addProfile = useTabel((s) => s.addProfile)
  const updateProfile = useTabel((s) => s.updateProfile)
  const deleteProfile = useTabel((s) => s.deleteProfile)
  const setDay = useTabel((s) => s.setDay)
  const clearMonth = useTabel((s) => s.clearMonth)
  const copyMonth = useTabel((s) => s.copyMonth)
  const fillMonth = useTabel((s) => s.fillMonth)

  const [ym, setYm] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [focusAdd, setFocusAdd] = useState(false)
  const [fillOpen, setFillOpen] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [editingDay, setEditingDay] = useState<number | null>(null)

  const profile = profiles.find((p) => p.id === activeId) ?? profiles[0]

  const y = ym.getFullYear()
  const m = ym.getMonth()
  const key = monthKey(y, m)
  const entries = profile?.months[key] ?? {}
  const filledCount = Object.keys(entries).length

  const places = useMemo(() => {
    if (!profile) return []
    const set = new Set<string>()
    Object.values(profile.months).forEach((days) =>
      Object.values(days).forEach((e) => {
        const p = e.place?.trim()
        if (p) set.add(p)
      }),
    )
    if (profile.defPlace.trim()) set.add(profile.defPlace.trim())
    return [...set]
  }, [profile])

  const today = useMemo(() => new Date(), [])
  const isCurrentMonth = today.getFullYear() === y && today.getMonth() === m

  useEffect(() => {
    void load()
  }, [load])

  if (offline) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <CloudOff className="size-7" />
        </div>
        <div>
          <p className="font-semibold">Сервер недоступен</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Не удалось загрузить табель с сервера. Проверьте соединение и попробуйте ещё раз.
          </p>
        </div>
        <Button onClick={() => void load()}>
          <RotateCcw /> Повторить
        </Button>
      </div>
    )
  }

  if (!loaded || !profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <div className="flex size-14 animate-pulse items-center justify-center rounded-2xl bg-emerald-600/90 text-white">
          <Clock3 className="size-7" />
        </div>
        <p className="text-sm text-muted-foreground">Загружаем табель…</p>
      </div>
    )
  }

  const openAddProfile = () => {
    setFocusAdd(true)
    setSettingsOpen(true)
  }
  const openSettings = () => {
    setFocusAdd(false)
    setSettingsOpen(true)
  }

  const handleFill = (opts: FillOptions) => {
    const res = fillMonth(profile.id, key, opts)
    toast.success('Месяц заполнен', {
      description: `Рабочих: ${res.work} · выходных: ${res.off}`,
    })
  }

  const handleCopyPrev = () => {
    const prev = new Date(y, m - 1, 1)
    const n = copyMonth(profile.id, monthKey(prev.getFullYear(), prev.getMonth()), key)
    if (n === 0) {
      toast.error('В прошлом месяце нет записей', {
        description: 'Сначала заполните предыдущий месяц',
      })
    } else {
      toast.success(`Скопировано дней: ${n}`, {
        description: 'Проверьте расписание и поправьте отдельные дни',
      })
    }
  }

  const handleClear = () => {
    clearMonth(profile.id, key)
    setClearOpen(false)
    toast.success('Месяц очищен')
  }

  const saveDay = (day: number, entry: DayEntry) => setDay(profile.id, key, day, entry)
  const deleteDay = (day: number) => setDay(profile.id, key, day, null)

  return (
    <div className="flex min-h-screen flex-col">
      <HeaderBar
        profiles={profiles}
        activeId={profile.id}
        onSwitch={setActive}
        onAddProfile={openAddProfile}
        onOpenSettings={openSettings}
      />

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-5 px-4 py-6">
        {/* месяц + действия */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-2xl border bg-card p-1 shadow-sm">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setYm(new Date(y, m - 1, 1))}
              aria-label="Предыдущий месяц"
            >
              <ChevronLeft className="size-4.5" />
            </Button>
            <div className="min-w-[150px] text-center">
              <div className="text-sm font-semibold leading-tight">
                {MONTHS_RU[m]} {y}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {filledCount > 0 ? `${filledCount} дн. заполнено` : 'нет записей'}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setYm(new Date(y, m + 1, 1))}
              aria-label="Следующий месяц"
            >
              <ChevronRight className="size-4.5" />
            </Button>
          </div>

          {!isCurrentMonth && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setYm(new Date(today.getFullYear(), today.getMonth(), 1))}
            >
              <CalendarRange /> Текущий месяц
            </Button>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" onClick={() => setFillOpen(true)}>
              <Wand2 /> Заполнить
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Ещё действия">
                  <MoreHorizontal className="size-4.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleCopyPrev}>
                  <History /> Скопировать прошлый месяц
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setClearOpen(true)}
                >
                  <Trash2 /> Очистить месяц
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <StatsPanel profile={profile} y={y} m={m} />

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_370px]">
          <DayList
            profile={profile}
            y={y}
            m={m}
            today={today}
            onEditDay={(d) => setEditingDay(d)}
            onFillClick={() => setFillOpen(true)}
          />
          <ExportCard profile={profile} y={y} m={m} />
        </div>
      </main>

      <footer className="mt-auto border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-muted-foreground">
          <span>Табель — учёт рабочих часов и примерной ЗП</span>
          <span>Данные хранятся на сервере — доступны с любого устройства</span>
        </div>
      </footer>

      <ProfileDialog
        open={settingsOpen}
        onOpenChange={(o) => {
          setSettingsOpen(o)
          if (!o) setFocusAdd(false)
        }}
        profiles={profiles}
        activeId={profile.id}
        focusAdd={focusAdd}
        onUpdate={updateProfile}
        onAdd={async (name) => {
          const ok = await addProfile(name)
          if (ok) {
            toast.success(`Профиль «${name}» создан`, {
              description: 'Задайте ставку и шаблон дня в настройках профиля',
            })
          }
        }}
        onDelete={() => toast.success('Профиль удалён')}
        onSwitch={setActive}
      />

      <FillDialog
        open={fillOpen}
        onOpenChange={setFillOpen}
        profile={profile}
        y={y}
        m={m}
        entries={entries}
        onFill={handleFill}
      />

      <DayEditDialog
        open={editingDay !== null}
        onOpenChange={(o) => {
          if (!o) setEditingDay(null)
        }}
        profile={profile}
        y={y}
        m={m}
        day={editingDay}
        entry={editingDay !== null ? entries[String(editingDay)] : undefined}
        places={places}
        onSave={(e) => editingDay !== null && saveDay(editingDay, e)}
        onDelete={() => editingDay !== null && deleteDay(editingDay)}
      />

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Очистить {MONTHS_RU[m].toLowerCase()} {y}?</AlertDialogTitle>
            <AlertDialogDescription>
              Все записи этого месяца для профиля «{profile.name}» будут удалены. Другие месяцы не
              затрагиваются.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleClear}
            >
              Очистить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
