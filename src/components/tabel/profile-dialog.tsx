'use client'

import { useEffect, useRef, useState } from 'react'
import { BadgeCheck, ChevronDown, Trash2, UserRoundPlus, Users } from 'lucide-react'
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
import type { Profile } from '@/lib/tabel'
import { LUNCH_OPTIONS } from '@/lib/tabel'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  profiles: Profile[]
  activeId: string
  focusAdd: boolean
  onUpdate: (id: string, patch: Partial<Omit<Profile, 'id' | 'months'>>) => void
  onAdd: (name: string) => void
  onDelete: (id: string) => void
  onSwitch: (id: string) => void
}

function RateChip({ profile }: { profile: Profile }) {
  if (profile.rate === null || profile.rate === undefined) return null
  return (
    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
      {profile.rate.toLocaleString('ru-RU')} ₽/ч
    </span>
  )
}

export function ProfileDialog({
  open,
  onOpenChange,
  profiles,
  activeId,
  focusAdd,
  onUpdate,
  onAdd,
  onDelete,
  onSwitch,
}: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const addRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open && focusAdd) {
      const t = setTimeout(() => addRef.current?.focus(), 80)
      return () => clearTimeout(t)
    }
  }, [open, focusAdd])

  const submitAdd = () => {
    const name = newName.trim()
    if (!name) return
    onAdd(name)
    setNewName('')
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setConfirmId(null)
        onOpenChange(o)
      }}
    >
      <DialogContent className="pretty-scroll max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="size-4.5 text-emerald-600" /> Профили
          </DialogTitle>
          <DialogDescription>
            Для вас и коллег: у каждого своя ставка, шаблон дня и табели по месяцам.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {profiles.map((p) => {
            const isActive = p.id === activeId
            const isOpen = expanded === p.id
            return (
              <div
                key={p.id}
                className={cn(
                  'rounded-xl border transition-colors',
                  isActive && 'border-emerald-500/40 bg-emerald-500/5',
                )}
              >
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : p.id)}
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-expanded={isOpen}
                >
                  <span
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                      isActive
                        ? 'bg-emerald-600 text-white'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {p.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="flex items-center gap-1.5">
                      {isActive && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                          <BadgeCheck className="size-3" /> активен
                        </span>
                      )}
                      <RateChip profile={p} />
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
                        <Label htmlFor={`name-${p.id}`}>Имя</Label>
                        <Input
                          id={`name-${p.id}`}
                          value={p.name}
                          onChange={(e) => onUpdate(p.id, { name: e.target.value })}
                          placeholder="Иван"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`rate-${p.id}`}>Ставка, ₽ за час</Label>
                        <Input
                          id={`rate-${p.id}`}
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
                        Шаблон рабочего дня (подставляется при заполнении месяца)
                      </p>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label htmlFor={`start-${p.id}`} className="text-xs">
                            Начало
                          </Label>
                          <Input
                            id={`start-${p.id}`}
                            type="time"
                            value={p.defStart}
                            onChange={(e) => onUpdate(p.id, { defStart: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`end-${p.id}`} className="text-xs">
                            Конец
                          </Label>
                          <Input
                            id={`end-${p.id}`}
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
                          id={`lunch-${p.id}`}
                          checked={p.defLunch}
                          onCheckedChange={(v) => onUpdate(p.id, { defLunch: v })}
                        />
                        <Label htmlFor={`lunch-${p.id}`} className="text-sm">
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
                        <Label htmlFor={`place-${p.id}`} className="text-xs">
                          Место
                        </Label>
                        <Input
                          id={`place-${p.id}`}
                          value={p.defPlace}
                          onChange={(e) => onUpdate(p.id, { defPlace: e.target.value })}
                          placeholder="Склад"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      {!isActive ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => onSwitch(p.id)}
                        >
                          <BadgeCheck /> Сделать активным
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Этот профиль сейчас открыт
                        </span>
                      )}
                      {confirmId === p.id ? (
                        <div className="flex items-center gap-1.5">
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
                            disabled={profiles.length <= 1}
                            onClick={() => {
                              onDelete(p.id)
                              setConfirmId(null)
                              setExpanded(null)
                            }}
                          >
                            Удалить навсегда
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          disabled={profiles.length <= 1}
                          title={
                            profiles.length <= 1 ? 'Нужен хотя бы один профиль' : 'Удалить профиль'
                          }
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
                  submitAdd()
                }
              }}
              placeholder="Имя коллеги, напр. «Ольга»"
            />
            <Button type="button" onClick={submitAdd} disabled={!newName.trim()}>
              <UserRoundPlus /> Добавить
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Профиль появится в переключателе вверху страницы.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
