'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { BarChart3, CalendarCheck2, Clock3, TrendingUp, Wallet } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { HalfStats, Profile } from '@/lib/tabel'
import {
  MONTHS_RU,
  WD_RU,
  dayHours,
  fmtMoney,
  fmtNum,
  halfStats,
  isoWeekday,
  monthStats,
} from '@/lib/tabel'

type DayBar = { d: number; wd: string; hours: number | null }

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  highlight,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  sub: string
  highlight?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-4',
        highlight
          ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
          : 'bg-card text-card-foreground',
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-lg',
            highlight ? 'bg-white/15 text-white' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
          )}
        >
          <Icon className="size-4.5" />
        </span>
        <span className={cn('text-xs font-medium', highlight ? 'text-emerald-50/90' : 'text-muted-foreground')}>
          {label}
        </span>
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight tabular-nums">{value}</div>
      <div className={cn('mt-0.5 truncate text-xs', highlight ? 'text-emerald-50/80' : 'text-muted-foreground')}>
        {sub}
      </div>
    </div>
  )
}

/** карточка половины месяца: часы, рабочие дни и деньги за 1–15 / 16–конец */
function HalfCard({ h, monthHours }: { h: HalfStats; monthHours: number }) {
  const share = monthHours > 0 ? Math.min(100, Math.round((h.totalHours / monthHours) * 100)) : 0
  return (
    <div className="rounded-2xl border bg-card p-4 text-card-foreground">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {h.half === 1 ? '1-я половина' : '2-я половина'}
        </span>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
          {h.from}–{h.to}
        </span>
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight tabular-nums">
        {fmtNum(h.totalHours)} <span className="text-sm font-semibold text-muted-foreground">ч</span>
      </div>
      <div className="mt-0.5 truncate text-xs text-muted-foreground">
        {h.workDays} раб. дн.{h.salary !== null ? ` · ${fmtMoney(h.salary)}` : ''}
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          className={cn('h-full rounded-full', h.half === 1 ? 'bg-emerald-500' : 'bg-sky-500')}
          style={{ width: `${share}%` }}
        />
      </div>
      <div className="mt-1 text-right text-[10px] tabular-nums text-muted-foreground">
        {share}% часов месяца
      </div>
    </div>
  )
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: DayBar }>
}) {
  if (!active || !payload?.length) return null
  const bar = payload[0].payload
  return (
    <div className="rounded-lg border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <span className="font-medium">
        {bar.d}-е, {bar.wd}
      </span>
      {bar.hours === null ? (
        <span className="text-muted-foreground"> — выходной</span>
      ) : (
        <span className="text-emerald-600 dark:text-emerald-400"> — {fmtNum(bar.hours)} ч</span>
      )}
    </div>
  )
}

export function StatsPanel({ profile, y, m }: { profile: Profile; y: number; m: number }) {
  const st = monthStats(profile, y, m)
  const [h1, h2] = halfStats(profile, y, m)
  const entries = profile.months[`${y}-${String(m + 1).padStart(2, '0')}`] ?? {}

  const data: DayBar[] = Array.from({ length: st.days }, (_, i) => {
    const d = i + 1
    return {
      d,
      wd: WD_RU[isoWeekday(new Date(y, m, d))].toLowerCase(),
      hours: dayHours(entries[String(d)]),
    }
  })

  return (
    <section aria-label="Итоги месяца" className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          icon={Clock3}
          label="Часы за месяц"
          value={`${fmtNum(st.totalHours)} ч`}
          sub={`обедов вычтено ${fmtNum(st.lunchHours)} ч`}
        />
        <StatCard
          icon={CalendarCheck2}
          label="Рабочих дней"
          value={String(st.workDays)}
          sub={`из ${st.days} дней месяца`}
        />
        <StatCard
          icon={TrendingUp}
          label="Средняя смена"
          value={st.workDays ? `${fmtNum(st.avgHours)} ч` : '—'}
          sub={st.workDays ? `макс. ${fmtNum(st.maxHours)} ч` : 'нет рабочих дней'}
        />
        <StatCard
          icon={Wallet}
          label="Примерная ЗП"
          value={st.salary !== null ? fmtMoney(st.salary) : '—'}
          sub={
            profile.rate
              ? `${fmtNum(profile.rate)} ₽/час × ${fmtNum(st.totalHours)} ч`
              : 'задайте ставку в профиле'
          }
          highlight={st.salary !== null}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <HalfCard h={h1} monthHours={st.totalHours} />
        <HalfCard h={h2} monthHours={st.totalHours} />
      </div>

      <Card className="py-4">
        <CardHeader className="pb-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="size-4.5 text-emerald-600" /> Часы по дням
          </CardTitle>
          <CardDescription>
            {MONTHS_RU[m].toLowerCase()} {y}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          {st.workDays === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              График появится, когда в месяце появятся рабочие дни.
            </p>
          ) : (
            <div className="h-[170px] w-full" role="img" aria-label="График часов по дням месяца">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="d"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={12}
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  />
                  <YAxis hide domain={[0, (max: number) => Math.ceil(max) + 1]} />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                  />
                  <Bar dataKey="hours" fill="var(--chart-1)" radius={[3, 3, 0, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
