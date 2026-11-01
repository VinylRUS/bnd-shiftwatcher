'use client'

import { useState } from 'react'
import { Armchair, Briefcase, MoonStar, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import type { DayEntry, Profile } from '@/lib/tabel'
import {
  LUNCH_OPTIONS,
  WD_RU,
  dayHours,
  fmtLunchShort,
  fmtNum,
  isOvernight,
  MONTHS_RU_GEN,
} from '@/lib/tabel'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: Profile
  y: number
  m: number
  day: number | null
  entry: DayEntry | undefined
  places: string[]
  onSave: (entry: DayEntry) => void
  onDelete: () => void
}

function DayForm({
  profile,
  date,
  entry,
  places,
  onSave,
  onDelete,
  onDone,
}: {
  profile: Profile
  date: Date
  entry: DayEntry | undefined
  places: string[]
  onSave: (entry: DayEntry) => void
  onDelete: () => void
  onDone: () => void
}) {
  const hadWork = !!entry && !entry.off
  const [off, setOff] = useState(entry ? entry.off : false)
  const [start, setStart] = useState(hadWork && entry.start ? entry.start : profile.defStart)
  const [end, setEnd] = useState(hadWork && entry.end ? entry.end : profile.defEnd)
  const [lunch, setLunch] = useState(hadWork ? entry.lunch : profile.defLunch)
  const [lunchMin, setLunchMin] = useState(hadWork && entry.lunchMin ? entry.lunchMin : profile.defLunchMin)
  const [place, setPlace] = useState(hadWork ? entry.place : profile.defPlace)

  const current: DayEntry = { off, start, end, lunch, lunchMin, place }
  const hours = dayHours(current)
  const overnight = isOvernight(current)

  const save = () => {
    onSave({
      off,
      start: off ? '' : start,
      end: off ? '' : end,
      lunch: off ? false : lunch,
      lunchMin: off ? 0 : lunchMin,
      place: off ? '' : place.trim(),
    })
    onDone()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {date.getDate()} {MONTHS_RU_GEN[date.getMonth()]} {date.getFullYear()},{' '}
          {WD_RU[(date.getDay() + 6) % 7].toLowerCase()}
        </DialogTitle>
        <DialogDescription>
          Задайте промежуток работы и обед — часы посчитаются автоматически.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Тип дня">
          <button
            type="button"
            aria-pressed={!off}
            onClick={() => setOff(false)}
            className={cn(
              'flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              !off
                ? 'border-emerald-600 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500 dark:text-emerald-400'
                : 'text-muted-foreground hover:bg-muted/60',
            )}
          >
            <Briefcase className="size-4" /> Работа
          </button>
          <button
            type="button"
            aria-pressed={off}
            onClick={() => setOff(true)}
            className={cn(
              'flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              off
                ? 'border-zinc-500 bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted/60',
            )}
          >
            <Armchair className="size-4" /> Выходной
          </button>
        </div>

        {!off && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="day-start">Начало</Label>
                <Input
                  id="day-start"
                  type="time"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="day-end">Конец</Label>
                <Input
                  id="day-end"
                  type="time"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </div>
            </div>

            {overnight && start && end && (
              <p className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                <MoonStar className="size-4 shrink-0" />
                Смена переходит на следующие сутки — часы посчитаются с +24 ч.
              </p>
            )}

            <div className="flex flex-wrap items-end gap-4">
              <div className="flex items-center gap-2 pb-2">
                <Switch id="day-lunch" checked={lunch} onCheckedChange={setLunch} />
                <Label htmlFor="day-lunch" className="text-sm">
                  Обед
                </Label>
              </div>
              {lunch && (
                <div className="w-[130px] space-y-1.5">
                  <Label className="text-xs">Длительность</Label>
                  <Select
                    value={String(lunchMin)}
                    onValueChange={(v) => setLunchMin(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LUNCH_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={String(o.value)}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="min-w-[130px] flex-1 space-y-1.5">
                <Label htmlFor="day-place">Место</Label>
                <Input
                  id="day-place"
                  list="tabel-places"
                  value={place}
                  onChange={(e) => setPlace(e.target.value)}
                  placeholder="Склад"
                />
                <datalist id="tabel-places">
                  {places.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="rounded-xl bg-muted/60 px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Итого за день</span>
                <span
                  className={cn(
                    'text-lg font-bold tabular-nums',
                    hours !== null && hours <= 0 && 'text-destructive',
                  )}
                >
                  {hours !== null ? `${fmtNum(hours)} ч` : '—'}
                </span>
              </div>
              <p className="mt-0.5 h-4 text-xs text-muted-foreground">
                {hours !== null && hours <= 0 ? (
                  <span className="inline-flex items-center gap-1 text-destructive">
                    <TriangleAlert className="size-3" /> Проверьте время и обед
                  </span>
                ) : lunch ? (
                  `обед ${fmtLunchShort(lunchMin)} вычтен`
                ) : (
                  'без вычета обеда'
                )}
              </p>
            </div>
          </>
        )}
      </div>

      <Separator className="my-1" />

      <div className="flex flex-wrap items-center justify-between gap-2">
        {entry ? (
          <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => { onDelete(); onDone() }}>
            Удалить запись
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={onDone}>
            Отмена
          </Button>
          <Button type="button" onClick={save} disabled={!off && (!start || !end)}>
            Сохранить
          </Button>
        </div>
      </div>
    </>
  )
}

export function DayEditDialog({
  open,
  onOpenChange,
  profile,
  y,
  m,
  day,
  entry,
  places,
  onSave,
  onDelete,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {day !== null && (
          <DayForm
            key={`${profile.id}-${y}-${m}-${day}`}
            profile={profile}
            date={new Date(y, m, day)}
            entry={entry}
            places={places}
            onSave={onSave}
            onDelete={onDelete}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
