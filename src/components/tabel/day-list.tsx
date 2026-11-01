'use client'

import { Fragment } from 'react'
import { CalendarDays, MoonStar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { DayEntry, HalfStats, Profile } from '@/lib/tabel'
import {
  WD_RU,
  dayHours,
  fmtLunchShort,
  fmtNum,
  fmtTimeShort,
  halfStats,
  isOvernight,
  monthStats,
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

/** полоса-разделитель половин месяца: итоги 1–15 и начало 16–конец */
function HalfDivider({ h1, h2 }: { h1: HalfStats; h2: HalfStats }) {
  return (
    <div
      className="sticky top-0 z-10 flex items-center gap-2.5 bg-muted px-4 py-1.5"
      role="separator"
      aria-label={`Граница половин месяца: 1–${h1.to} и ${h2.from}–${h2.to}`}
    >
      <span className="whitespace-nowrap text-[11px] font-medium text-muted-foreground">
        1-я половина · {fmtNum(h1.totalHours)} ч
      </span>
      <span className="h-px flex-1 bg-border" aria-hidden />
      <span className="whitespace-nowrap text-[11px] font-medium text-muted-foreground">
        2-я половина ({h2.from}–{h2.to}) · {fmtNum(h2.totalHours)} ч
      </span>
    </div>
  )
}

export function DayList({ profile, y, m, today, onEditDay, onFillClick }: Props) {
  const entries = profile.months[`${y}-${String(m + 1).padStart(2, '0')}`] ?? {}
  const st = monthStats(profile, y, m)
  const [h1, h2] = halfStats(profile, y, m)
  const dim = st.days
  const filled = Object.keys(entries).length
  const isCurrentMonth =
    today.getFullYear() === y && today.getMonth() === m

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="size-4.5 text-emerald-600" /> Дни месяца
        </CardTitle>
        <CardDescription>
          {st.workDays > 0 ? (
            <>
              {st.workDays} рабочих · {fmtNum(st.totalHours)} ч всего
            </>
          ) : (
            <>Заполненных дней пока нет</>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="p-0">
        {filled === 0 ? (
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
        ) : (
          <div className="pretty-scroll max-h-[560px] divide-y overflow-y-auto">
            {Array.from({ length: dim }, (_, i) => i + 1).map((d) => (
              <Fragment key={d}>
                {d === 16 && <HalfDivider h1={h1} h2={h2} />}
                <DayRow
                  d={d}
                  y={y}
                  m={m}
                  entry={entries[String(d)]}
                  isToday={isCurrentMonth && today.getDate() === d}
                  onEdit={() => onEditDay(d)}
                />
              </Fragment>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
