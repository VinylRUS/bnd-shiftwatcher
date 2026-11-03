'use client'

// «Профили и доступы» — диалог админа:
//   • создать профиль (имя; при первом входе по имени коллега сам задаст пин);
//   • открыть любой профиль, введя его пинкод (переключение без выхода);
//   • задать пинкод профилю напрямую или сбросить его (если коллега забыл);
//   • переименовать, поправить ставку/шаблон, удалить профиль.
// Свой профиль здесь не редактируется — для этого есть «Настройки профиля».

import { useRef, useState } from 'react'
import {
  BadgeCheck,
  ChevronDown,
  KeyRound,
  LogIn,
  RotateCcw,
  Trash2,
  UserRoundPlus,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
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
import { PinFlow } from '@/components/tabel/pin-pad'
import type { AdminProfile, ApiResult } from '@/lib/store'
import { LUNCH_OPTIONS } from '@/lib/tabel'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  profiles: AdminProfile[]
  meId: string
  onOpenProfile: (id: string, pin: string) => Promise<ApiResult>
  onCreate: (name: string) => Promise<ApiResult>
  onUpdate: (id: string, patch: Partial<Omit<AdminProfile, 'id' | 'hasPin'>>) => void
  onDelete: (id: string) => Promise<ApiResult>
  onSetPin: (id: string, pin: string | null) => Promise<ApiResult>
}

/** внутренний диалог с пинклавиатурой: вход в профиль или установка пина */
type PinTask =
  | { kind: 'open'; profile: AdminProfile }
  | { kind: 'set'; profile: AdminProfile }

export function AdminDialog({
  open,
  onOpenChange,
  profiles,
  meId,
  onOpenProfile,
  onCreate,
  onUpdate,
  onDelete,
  onSetPin,
}: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [pinTask, setPinTask] = useState<PinTask | null>(null)
  const [resetConfirm, setResetConfirm] = useState<AdminProfile | null>(null)
  const addRef = useRef<HTMLInputElement>(null)

  // сброс внутреннего состояния при закрытии — в onOpenChange, без эффекта
  const handleOpenChange = (o: boolean) => {
    if (!o) {
      setExpanded(null)
      setConfirmId(null)
      setPinTask(null)
      setResetConfirm(null)
    }
    onOpenChange(o)
  }

  const submitAdd = async () => {
    const name = newName.trim()
    if (!name) return
    const r = await onCreate(name)
    if (r.ok) {
      toast.success(`Профиль «${name}» создан`, {
        description:
          'Передайте коллеге: первый вход — по имени, сразу предложит задать пинкод. Либо задайте пин сами ниже в списке.',
      })
      setNewName('')
      setTimeout(() => addRef.current?.focus(), 80)
    } else {
      toast.error('Не удалось создать профиль', { description: r.error })
    }
  }

  const others = profiles.filter((p) => p.id !== meId)
  const me = profiles.find((p) => p.id === meId)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="pretty-scroll max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="size-4.5 text-emerald-600" /> Профили и доступы
          </DialogTitle>
          <DialogDescription>
            Создавайте профили коллег — каждый защищён своим пинкодом из 6 цифр.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {/* свой профиль */}
          {me && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 px-3 py-2.5">
              <div className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-semibold text-white">
                  {me.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{me.name}</span>
                  <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-400">
                    <span className="inline-flex items-center gap-1">
                      <BadgeCheck className="size-3" /> это вы · администратор
                    </span>
                  </span>
                </span>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Свои настройки и смену пинкода открывайте иконкой шестерёнки в шапке.
              </p>
            </div>
          )}

          {/* профили коллег */}
          {others.map((p) => {
            const isOpen = expanded === p.id
            return (
              <div key={p.id} className="rounded-xl border transition-colors">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : p.id)}
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-expanded={isOpen}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                    {p.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 text-[11px]',
                          p.hasPin
                            ? 'text-muted-foreground'
                            : 'text-amber-600 dark:text-amber-400',
                        )}
                      >
                        <KeyRound className="size-3" />
                        {p.hasPin ? 'пин задан' : 'без пина — первый вход по имени'}
                      </span>
                      {p.rate !== null && p.rate !== undefined && (
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                          {p.rate.toLocaleString('ru-RU')} ₽/ч
                        </span>
                      )}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn(
                      'size-4 shrink-0 text-muted-foreground transition-transform',
                      isOpen && 'rotate-180',
                    )}
                  />
                </button>

                {isOpen && (
                  <div className="space-y-4 border-t px-3 pb-4 pt-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor={`a-name-${p.id}`}>Имя</Label>
                        <Input
                          id={`a-name-${p.id}`}
                          value={p.name}
                          onChange={(e) => onUpdate(p.id, { name: e.target.value })}
                          placeholder="Иван"
                          maxLength={60}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`a-rate-${p.id}`}>Ставка, ₽ за час</Label>
                        <Input
                          id={`a-rate-${p.id}`}
                          type="number"
                          min="0"
                          step="any"
                          inputMode="decimal"
                          placeholder="напр. 500"
                          value={p.rate ?? ''}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value.replace(',', '.'))
                            onUpdate(p.id, { rate: Number.isFinite(v) && v > 0 ? v : null })
                          }}
                        />
                      </div>
                    </div>

                    <Separator />

                    <div>
                      <p className="mb-2 text-xs font-medium text-muted-foreground">
                        Шаблон рабочего дня
                      </p>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label htmlFor={`a-start-${p.id}`} className="text-xs">
                            Начало
                          </Label>
                          <Input
                            id={`a-start-${p.id}`}
                            type="time"
                            value={p.defStart}
                            onChange={(e) => onUpdate(p.id, { defStart: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`a-end-${p.id}`} className="text-xs">
                            Конец
                          </Label>
                          <Input
                            id={`a-end-${p.id}`}
                            type="time"
                            value={p.defEnd}
                            onChange={(e) => onUpdate(p.id, { defEnd: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-end gap-4">
                      <div className="flex items-center gap-2 pb-2">
                        <Switch
                          id={`a-lunch-${p.id}`}
                          checked={p.defLunch}
                          onCheckedChange={(v) => onUpdate(p.id, { defLunch: v })}
                        />
                        <Label htmlFor={`a-lunch-${p.id}`} className="text-sm">
                          Обед
                        </Label>
                      </div>
                      {p.defLunch && (
                        <div className="w-[130px] space-y-1.5">
                          <Label className="text-xs">Длительность</Label>
                          <Select
                            value={String(p.defLunchMin)}
                            onValueChange={(v) => onUpdate(p.id, { defLunchMin: Number(v) })}
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
                        <Label htmlFor={`a-place-${p.id}`} className="text-xs">
                          Место
                        </Label>
                        <Input
                          id={`a-place-${p.id}`}
                          value={p.defPlace}
                          onChange={(e) => onUpdate(p.id, { defPlace: e.target.value })}
                          placeholder="Склад"
                          maxLength={60}
                        />
                      </div>
                    </div>

                    <Separator />

                    {/* доступы */}
                    <div className="flex flex-wrap items-center gap-2">
                      {p.hasPin ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setPinTask({ kind: 'open', profile: p })}
                        >
                          <LogIn /> Открыть профиль
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Пин не установлен — коллега входит по имени и задаёт пин
                        </span>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setPinTask({ kind: 'set', profile: p })}
                      >
                        <KeyRound /> Задать пинкод
                      </Button>
                      {p.hasPin &&
                        (resetConfirm?.id === p.id ? (
                          <span className="flex items-center gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => setResetConfirm(null)}
                            >
                              Отмена
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              onClick={async () => {
                                const r = await onSetPin(p.id, null)
                                if (r.ok) {
                                  toast.success(`Пинкод профиля «${p.name}» сброшен`, {
                                    description:
                                      'Следующий вход — снова по имени, предложит задать новый пин.',
                                  })
                                } else {
                                  toast.error('Не удалось сбросить пинкод', {
                                    description: r.error,
                                  })
                                }
                                setResetConfirm(null)
                              }}
                            >
                              <RotateCcw /> Сбросить
                            </Button>
                          </span>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground"
                            title="Если пин забыт"
                            onClick={() => setResetConfirm(p)}
                          >
                            <RotateCcw /> Сбросить пин
                          </Button>
                        ))}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <span className="text-xs text-muted-foreground">
                        Удаление сотрёт все месяцы профиля
                      </span>
                      {confirmId === p.id ? (
                        <span className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmId(null)}
                          >
                            Отмена
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={async () => {
                              const r = await onDelete(p.id)
                              if (!r.ok) {
                                toast.error('Не удалось удалить профиль', {
                                  description: r.error,
                                })
                              }
                              setConfirmId(null)
                              setExpanded(null)
                            }}
                          >
                            Удалить навсегда
                          </Button>
                        </span>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setConfirmId(p.id)}
                        >
                          <Trash2 /> Удалить
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <Separator />

        <div className="space-y-2">
          <Label htmlFor="new-profile-name" className="text-sm font-medium">
            Новый профиль
          </Label>
          <div className="flex gap-2">
            <Input
              id="new-profile-name"
              ref={addRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void submitAdd()
                }
              }}
              placeholder="Имя коллеги, напр. «Олеся»"
              maxLength={60}
            />
            <Button type="button" onClick={submitAdd} disabled={!newName.trim()}>
              <UserRoundPlus /> Добавить
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            После создания передайте коллеге имя профиля: на первом входе по имени
            приложение попросит задать пинкод.
          </p>
        </div>
      </DialogContent>

      {/* пинклавиатура: вход в профиль или установка пина */}
      <Dialog open={pinTask !== null} onOpenChange={(o) => !o && setPinTask(null)}>
        <DialogContent className="max-w-sm">
          <DialogTitle className="sr-only">Пинкод профиля</DialogTitle>
          <DialogDescription className="sr-only">
            {pinTask?.kind === 'set' ? 'Задание нового пинкода' : 'Вход в профиль по пинкоду'}
          </DialogDescription>
          {pinTask?.kind === 'open' && (
            <PinFlow
              key={`open-${pinTask.profile.id}`}
              confirmNew={false}
              newTitle={`Пинкод профиля «${pinTask.profile.name}»`}
              newDescription="Введите пин, чтобы открыть этот профиль"
              onSubmit={({ next }) => onOpenProfile(pinTask.profile.id, next)}
              onDone={() => {
                setPinTask(null)
                onOpenChange(false)
              }}
              onCancel={() => setPinTask(null)}
            />
          )}
          {pinTask?.kind === 'set' && (
            <PinFlow
              key={`set-${pinTask.profile.id}`}
              confirmNew
              newTitle={`Пинкод для «${pinTask.profile.name}»`}
              newDescription="Придумайте 6 цифр и сообщите их коллеге"
              onSubmit={({ next }) => onSetPin(pinTask.profile.id, next)}
              onDone={() => {
                setPinTask(null)
                toast.success('Пинкод задан', {
                  description: `Профиль «${pinTask.profile.name}» теперь входит по этому пинкоду.`,
                })
              }}
              onCancel={() => setPinTask(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
