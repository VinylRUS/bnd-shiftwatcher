'use client'

import { CalendarDays, MoonStar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { DayEntry, HalfStats, Profile } from '@/lib/tabel'
import {
  WD_RU,
  dayHours,
  fmtLunchShort,
  fmtMoney,
  fmtNum,
  fmtTimeShort,
  halfStats,
  isOvernight,
} from '@/lib/tabel'

type Props = {
  profile: Profile
  y: number
  m: number
  today: Date
  onEditDay: (day: number) => void
  onFillClick: () => void
}

function DayRow({
  d,
  y,
  m,
  entry,
  isToday,
  onEdit,
}: {
  d: number
  y: number
  m: number
  entry: DayEntry | undefined
  isToday: boolean
  onEdit: () => void
}) {
  const date = new Date(y, m, d)
  const wd = (date.getDay() + 6) % 7
  const weekend = wd >= 5
  const hours = dayHours(entry)
  const isWork = hours !== null
  const overnight = isOvernight(entry)

  const summary = isWork ? (
    <span className="truncate">
      <span className="font-medium tabular-nums">
        {fmtTimeShort(entry!.start)}-{fmtTimeShort(entry!.end)}
      </span>
      {entry!.place.trim() && <span className="text-muted-foreground"> · {entry!.place}</span>}
      <span className="text-muted-foreground">
        {' '}
        · {entry!.lunch ? `обед ${fmtLunchShort(entry!.lunchMin)}` : 'без обеда'}
      </span>
    </span>
  ) : entry ? (
    <span className="text-muted-foreground">Выходной</span>
  ) : (
    <span className="text-muted-foreground/60">Не заполнено — выгружается как выходной</span>
  )

  return (
    <button
      type="button"
      onClick={onEdit}
      className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:bg-muted/50"
      aria-label={`Изменить ${d} число`}
    >
      <span
        className={cn(
          'w-11 shrink-0 rounded-lg py-1 text-center',
          isToday && 'bg-emerald-500/10 ring-1 ring-emerald-500/40',
        )}
      >
        <span
          className={cn(
            'block text-base font-semibold leading-none tabular-nums',
            isToday && 'text-emerald-700 dark:text-emerald-400',
          )}
        >
          {d}
        </span>
        <span
          className={cn(
            'mt-0.5 block text-[10px] font-medium uppercase',
            weekend ? 'text-amber-600/90 dark:text-amber-500/80' : 'text-muted-foreground',
          )}
        >
          {WD_RU[wd]}
        </span>
      </span>

      <span className="min-w-0 flex-1 text-sm">{summary}</span>

      {overnight && <MoonStar className="size-3.5 shrink-0 text-muted-foreground" />}

      <span
        className={cn(
          'shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums',
          isWork
            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
            : 'bg-muted text-muted-foreground',
        )}
      >
        {isWork ? `${fmtNum(hours!)} ч` : '—'}
      </span>
    </button>
  )
}

/** карточка одной половины месяца: итоги в шапке и дни своего диапазона */
function HalfSection({
  h,
  entries,
  y,
  m,
  todayDay,
  onEditDay,
}: {
  h: HalfStats
  entries: Record<string, DayEntry>
  y: number
  m: number
  todayDay: number | null
  onEditDay: (day: number) => void
}) {
  const isCurrentHalf = todayDay !== null && todayDay >= h.from && todayDay <= h.to
  const days = Array.from({ length: h.to - h.from + 1 }, (_, i) => h.from + i)

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b py-4">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <CalendarDays className="size-4.5 text-emerald-600" />
          {h.half === 1 ? '1-я половина' : '2-я половина'}
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums',
              h.half === 1
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
            )}
          >
            {h.from}–{h.to}
          </span>
          {isCurrentHalf && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              текущая
            </span>
          )}
        </CardTitle>
        <CardDescription>
          {h.workDays > 0 ? (
            <>
              {h.workDays} рабочих · {fmtNum(h.totalHours)} ч
              {h.salary !== null ? ` · ${fmtMoney(h.salary)}` : ''}
            </>
          ) : (
            <>Рабочих дней пока нет</>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {days.map((d) => (
            <DayRow
              key={d}
              d={d}
              y={y}
              m={m}
              entry={entries[String(d)]}
              isToday={todayDay === d}
              onEdit={() => onEditDay(d)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function DayList({ profile, y, m, today, onEditDay, onFillClick }: Props) {
  const entries = profile.months[`${y}-${String(m + 1).padStart(2, '0')}`] ?? {}
  const [h1, h2] = halfStats(profile, y, m)
  const filled = Object.keys(entries).length
  const isCurrentMonth = today.getFullYear() === y && today.getMonth() === m
  const todayDay = isCurrentMonth ? today.getDate() : null

  // пустой месяц — одна карточка с предложением заполнить по шаблону
  if (filled === 0) {
    return (
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b py-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="size-4.5 text-emerald-600" /> Дни месяца
          </CardTitle>
          <CardDescription>Заполненных дней пока нет</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-500/10">
              <CalendarDays className="size-6 text-emerald-600" />
            </div>
            <div>
              <p className="font-medium">Месяц пока пустой</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Заполните его по шаблону — потом поправьте отдельные дни в пару кликов.
              </p>
            </div>
            <Button onClick={onFillClick}>Заполнить по шаблону</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // табель разделён на два полумесяца: 1–15 и 16–конец месяца
  return (
    <div className="space-y-5">
      <HalfSection h={h1} entries={entries} y={y} m={m} todayDay={todayDay} onEditDay={onEditDay} />
      <HalfSection h={h2} entries={entries} y={y} m={m} todayDay={todayDay} onEditDay={onEditDay} />
    </div>
  )
}
