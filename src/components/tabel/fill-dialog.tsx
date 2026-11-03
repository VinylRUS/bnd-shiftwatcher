'use client'

import { useState } from 'react'
import { CalendarRange, Info } from 'lucide-react'
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { DayEntry, Profile } from '@/lib/tabel'
import type { FillOptions } from '@/lib/store'
import { LUNCH_OPTIONS, WD_RU, daysInMonth, halfRange, isoWeekday } from '@/lib/tabel'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: Profile
  y: number
  m: number
  entries: Record<string, DayEntry>
  onFill: (opts: FillOptions) => void
}

function FillForm({
  profile,
  y,
  m,
  entries,
  onFill,
  onDone,
}: {
  profile: Profile
  y: number
  m: number
  entries: Record<string, DayEntry>
  onFill: (opts: FillOptions) => void
  onDone: () => void
}) {
  const [workdays, setWorkdays] = useState<string[]>(['0', '1', '2', '3', '4'])
  const [onlyEmpty, setOnlyEmpty] = useState(true)
  const [scope, setScope] = useState<'month' | 'first' | 'second'>('month')
  const [start, setStart] = useState(profile.defStart)
  const [end, setEnd] = useState(profile.defEnd)
  const [lunch, setLunch] = useState(profile.defLunch)
  const [lunchMin, setLunchMin] = useState(profile.defLunchMin)
  const [place, setPlace] = useState(profile.defPlace)

  const dim = daysInMonth(y, m)
  const range = scope === 'month' ? { from: 1, to: dim } : halfRange(scope === 'second' ? 2 : 1, y, m)
  const work = new Set(workdays)
  let wouldWork = 0
  let wouldOff = 0
  let skipped = 0
  for (let d = range.from; d <= range.to; d++) {
    if (onlyEmpty && entries[String(d)]) {
      skipped++
      continue
    }
    if (work.has(String(isoWeekday(new Date(y, m, d))))) wouldWork++
    else wouldOff++
  }

  const apply = () => {
    onFill({
      workdays: workdays.map(Number),
      onlyEmpty,
      scope,
      start,
      end,
      lunch,
      lunchMin,
      place,
    })
    onDone()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CalendarRange className="size-4.5 text-emerald-600" /> Заполнить месяц по шаблону
        </DialogTitle>
        <DialogDescription>
          Отметьте рабочие дни недели и задайте промежуток — остальное можно править по дням.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-5">
        <div className="space-y-2">
          <Label>Что заполнить</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            value={scope}
            onValueChange={(v) => v && setScope(v as 'month' | 'first' | 'second')}
            className="flex w-full"
            aria-label="Период заполнения"
          >
            <ToggleGroupItem value="month" className="min-h-9 flex-1 text-xs">
              Весь месяц
            </ToggleGroupItem>
            <ToggleGroupItem value="first" className="min-h-9 flex-1 text-xs">
              1–15
            </ToggleGroupItem>
            <ToggleGroupItem value="second" className="min-h-9 flex-1 text-xs">
              16–{dim}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="space-y-2">
          <Label>Рабочие дни недели</Label>
          <ToggleGroup
            type="multiple"
            variant="outline"
            value={workdays}
            onValueChange={setWorkdays}
            className="flex w-full"
            aria-label="Рабочие дни недели"
          >
            {WD_RU.map((wd, i) => (
              <ToggleGroupItem
                key={wd}
                value={String(i)}
                className="min-h-10 flex-1 text-xs font-medium"
                aria-label={wd}
              >
                {wd}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {workdays.length === 0 && (
            <p className="text-xs text-destructive">Отметьте хотя бы один день</p>
          )}
        </div>

        <RadioGroup
          value={onlyEmpty ? 'empty' : 'all'}
          onValueChange={(v) => setOnlyEmpty(v === 'empty')}
          className="gap-2"
        >
          <Label className="flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 font-normal has-[button[data-state=checked]]:border-emerald-600">
            <RadioGroupItem value="empty" className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium">Только незаполненные дни</span>
              <span className="block text-xs text-muted-foreground">
                Уже заполненные дни не изменятся
              </span>
            </span>
          </Label>
          <Label className="flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 font-normal has-[button[data-state=checked]]:border-emerald-600">
            <RadioGroupItem value="all" className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium">
                {scope === 'month' ? 'Перезаписать все дни месяца' : 'Перезаписать все дни половины'}
              </span>
              <span className="block text-xs text-muted-foreground">
                {scope === 'month'
                  ? 'Месяц будет заполнен заново по шаблону'
                  : 'Выбранная половина будет заполнена заново по шаблону'}
              </span>
            </span>
          </Label>
        </RadioGroup>

        <div className="space-y-3 rounded-xl border p-3">
          <p className="text-xs font-medium text-muted-foreground">Шаблон рабочего дня</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fill-start" className="text-xs">
                Начало
              </Label>
              <Input
                id="fill-start"
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fill-end" className="text-xs">
                Конец
              </Label>
              <Input
                id="fill-end"
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex items-center gap-2 pb-2">
              <Switch id="fill-lunch" checked={lunch} onCheckedChange={setLunch} />
              <Label htmlFor="fill-lunch" className="text-sm">
                Обед
              </Label>
            </div>
            {lunch && (
              <div className="w-[130px] space-y-1.5">
                <Label className="text-xs">Длительность</Label>
                <Select value={String(lunchMin)} onValueChange={(v) => setLunchMin(Number(v))}>
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
            <div className="min-w-[120px] flex-1 space-y-1.5">
              <Label htmlFor="fill-place" className="text-xs">
                Место
              </Label>
              <Input
                id="fill-place"
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                placeholder="Склад"
              />
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-800 dark:text-emerald-300">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>
            Будет заполнено: <b>{wouldWork} раб.</b> и <b>{wouldOff} вых.</b>
            {skipped > 0 && <> · пропустим уже заполненных: {skipped}</>}
            {scope !== 'month' && <> · другая половина не изменится</>}
          </span>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onDone}>
          Отмена
        </Button>
        <Button type="button" onClick={apply} disabled={workdays.length === 0 || !start || !end}>
          Заполнить
        </Button>
      </div>
    </>
  )
}

export function FillDialog({ open, onOpenChange, profile, y, m, entries, onFill }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="pretty-scroll max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <FillForm
          profile={profile}
          y={y}
          m={m}
          entries={entries}
          onFill={onFill}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
