'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Copy, DatabaseBackup, Download, FileText, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
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
import { useTabel } from '@/lib/store'
import type { ExportPeriod, Profile } from '@/lib/tabel'
import {
  buildExport,
  daysInMonth,
  fmtMoney,
  fmtNum,
  periodStats,
} from '@/lib/tabel'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

/** копирование с запасным вариантом для сайтов без https (Clipboard API недоступен) */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

function downloadBlob(filename: string, text: string, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function safeName(s: string): string {
  return (
    s
      .trim()
      .replace(/[^\wа-яёА-ЯЁ-]+/gi, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 30) || 'profil'
  )
}

export function ExportCard({ profile, y, m }: { profile: Profile; y: number; m: number }) {
  const [withHeader, setWithHeader] = useState(false)
  const [period, setPeriod] = useState<ExportPeriod>('month')
  const [pending, setPending] = useState<{ profiles: Profile[]; activeId: string; date?: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const replaceAll = useTabel((s) => s.replaceAll)
  const isAdmin = useTabel((s) => s.isAdmin)

  const st = periodStats(profile, y, m, period)
  const text = buildExport(profile, y, m, withHeader, period)
  const lines = text.split('\n')
  const dim = daysInMonth(y, m)
  const mm = String(m + 1).padStart(2, '0')
  const suffix = period === 'month' ? '' : period === 'first' ? '_1-15' : `_16-${dim}`
  const periodLabel =
    period === 'month' ? 'весь месяц' : period === 'first' ? '1-я половина (1–15)' : `2-я половина (16–${dim})`

  const onCopy = async () => {
    const ok = await copyText(text)
    if (ok)
      toast.success('Скопировано', {
        description: `${periodLabel[0].toUpperCase()}${periodLabel.slice(1)} — вставьте в сообщение для HR`,
      })
    else toast.error('Не удалось скопировать', { description: 'Скачайте файл .txt и отправьте его' })
  }

  const onDownloadTxt = () => {
    const name = `Табель_${safeName(profile.name)}_${y}-${mm}${suffix}.txt`
    downloadBlob(name, text)
    toast.success('Файл сохранён', { description: name })
  }

  const onBackup = async () => {
    try {
      // админ сохраняет ВСЕ профили, обычный профиль — только себя
      let profiles: Profile[] = [profile]
      let activeId = profile.id
      if (isAdmin) {
        const res = await fetch('/api/export-all')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as { profiles?: Profile[] }
        profiles = Array.isArray(data.profiles) ? data.profiles : []
        if (profiles.length === 0) throw new Error('пусто')
        activeId = profiles.some((p) => p.id === profile.id) ? profile.id : profiles[0].id
      }
      const data = JSON.stringify(
        { app: 'tabel', version: 1, exportedAt: new Date().toISOString(), profiles, activeId },
        null,
        2,
      )
      downloadBlob(`tabel-backup-${y}-${mm}.json`, data, 'application/json;charset=utf-8')
      toast.success('Резервная копия сохранена', {
        description: isAdmin ? `Все профили: ${profiles.length}` : 'Ваш профиль',
      })
    } catch {
      toast.error('Не удалось сохранить копию', {
        description: 'Сервер недоступен — попробуйте ещё раз',
      })
    }
  }

  const onFileChosen = async (file: File | undefined) => {
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text())
      const ok =
        parsed &&
        Array.isArray(parsed.profiles) &&
        parsed.profiles.length > 0 &&
        parsed.profiles.every(
          (p: Profile) => p && typeof p.id === 'string' && typeof p.name === 'string' && p.months && typeof p.months === 'object',
        )
      if (!ok) throw new Error('bad')
      setPending({
        profiles: parsed.profiles,
        activeId: parsed.activeId ?? parsed.profiles[0].id,
        date: parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString('ru-RU') : undefined,
      })
    } catch {
      toast.error('Не удалось прочитать файл', { description: 'Проверьте, что это резервная копия Табеля (.json)' })
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const applyImport = async () => {
    if (!pending) return
    const ok = await replaceAll({ profiles: pending.profiles })
    if (ok) {
      toast.success('Данные восстановлены', {
        description: `Профилей: ${pending.profiles.length}`,
      })
    }
    setPending(null)
  }

  return (
    <>
      <Card className="gap-0 overflow-hidden py-0 lg:sticky lg:top-20">
        <CardHeader className="border-b py-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10">
              <FileText className="size-4 text-emerald-600" />
            </span>
            Выгрузка для HR
          </CardTitle>
          <CardDescription>
            Каждый день периода отдельной строкой — можно копировать или скачать файлом
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3 p-4">
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Период выгрузки</span>
            <ToggleGroup
              type="single"
              value={period}
              onValueChange={(v) => v && setPeriod(v as ExportPeriod)}
              variant="outline"
              size="sm"
              className="w-full"
              aria-label="Период выгрузки для HR"
            >
              <ToggleGroupItem value="month" className="text-xs">
                Весь месяц
              </ToggleGroupItem>
              <ToggleGroupItem value="first" className="text-xs">
                1–15
              </ToggleGroupItem>
              <ToggleGroupItem value="second" className="text-xs">
                16–{dim}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <Label className="flex cursor-pointer items-start gap-2.5 font-normal">
            <Checkbox
              checked={withHeader}
              onCheckedChange={(v) => setWithHeader(v === true)}
              className="mt-0.5"
            />
            <span>
              <span className="text-sm font-medium">Добавить шапку</span>
              <span className="block text-xs text-muted-foreground">
                Имя, месяц и итоговые часы первой строкой
                {period === 'month' && ' + разбивка по половинам'}
              </span>
            </span>
          </Label>

          <div
            className="pretty-scroll max-h-72 overflow-auto rounded-xl bg-zinc-950 p-3 font-mono text-[11.5px] leading-relaxed text-zinc-100 shadow-inner dark:bg-zinc-900"
            aria-label="Предпросмотр выгрузки"
          >
            {lines.map((line, i) => {
              if (line === '') return <div key={i} className="h-2" aria-hidden />
              const parts = line.split('  ')
              if (parts.length < 2) {
                return (
                  <div key={i} className="font-semibold text-amber-300/90">
                    {line}
                  </div>
                )
              }
              const [date, ...rest] = parts
              const tail = rest.join('  ')
              return (
                <div key={i} className="whitespace-pre">
                  <span className="text-emerald-400">{date}</span>
                  {'  '}
                  <span className={tail === 'Выходной' ? 'text-zinc-500' : undefined}>{tail}</span>
                </div>
              )
            })}
          </div>

          <p className="text-xs text-muted-foreground">
            {periodLabel[0].toUpperCase()}
            {periodLabel.slice(1)}: {st.workDays} раб. дн. · {fmtNum(st.totalHours)} ч
            {st.salary !== null && ` · ${fmtMoney(st.salary)}`} · незаполненные дни уходят как
            «Выходной»
          </p>

          <div className="grid grid-cols-2 gap-2">
            <Button onClick={onCopy}>
              <Copy /> Копировать
            </Button>
            <Button variant="outline" onClick={onDownloadTxt}>
              <Download /> .txt
            </Button>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <DatabaseBackup className="size-4 text-muted-foreground" />
              Резервная копия
            </div>
            <p className="text-xs text-muted-foreground">
              {isAdmin
                ? 'Копия всех профилей табеля — пригодится для переезда на другой сервер или подстраховки перед обновлением.'
                : 'Копия вашего профиля. Полную копию табеля делает администратор.'}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={onBackup}>
                <Download /> Сохранить
              </Button>
              {isAdmin && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => fileRef.current?.click()}
                  >
                    <RotateCcw /> Восстановить
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(e) => onFileChosen(e.target.files?.[0])}
                  />
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Восстановить резервную копию?</AlertDialogTitle>
            <AlertDialogDescription>
              Текущие данные будут заменены: профилей — {pending?.profiles.length}
              {pending?.date ? `, копия от ${pending.date}` : ''}. Пинкоды в копии не
              хранятся — после восстановления все входят по имени и задают пин заново.
              Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={applyImport}>Восстановить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
