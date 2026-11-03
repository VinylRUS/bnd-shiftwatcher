'use client'

// Настройки СВОЕГО профиля: имя, ставка, шаблон дня и смена пинкода.
// Управление чужими профилями — у админа, в AdminDialog.

import { useState } from 'react'
import { KeyRound, Settings2 } from 'lucide-react'
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
import type { ApiResult } from '@/lib/store'
import type { Profile } from '@/lib/tabel'
import { LUNCH_OPTIONS } from '@/lib/tabel'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: Profile
  onUpdate: (id: string, patch: Partial<Omit<Profile, 'id' | 'months'>>) => void
  onChangePin: (currentPin: string, newPin: string) => Promise<ApiResult>
}

export function ProfileDialog({ open, onOpenChange, profile, onUpdate, onChangePin }: Props) {
  const [pinOpen, setPinOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="pretty-scroll max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="size-4.5 text-emerald-600" /> Настройки профиля
          </DialogTitle>
          <DialogDescription>
            Ваша ставка и шаблон рабочего дня — они подставляются при заполнении месяца.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="set-name">Имя</Label>
              <Input
                id="set-name"
                value={profile.name}
                onChange={(e) => onUpdate(profile.id, { name: e.target.value })}
                placeholder="Иван"
                maxLength={60}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="set-rate">Ставка, ₽ за час</Label>
              <Input
                id="set-rate"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                placeholder="напр. 500"
                value={profile.rate ?? ''}
                onChange={(e) => {
                  const v = parseFloat(e.target.value.replace(',', '.'))
                  onUpdate(profile.id, { rate: Number.isFinite(v) && v > 0 ? v : null })
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
                <Label htmlFor="set-start" className="text-xs">
                  Начало
                </Label>
                <Input
                  id="set-start"
                  type="time"
                  value={profile.defStart}
                  onChange={(e) => onUpdate(profile.id, { defStart: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="set-end" className="text-xs">
                  Конец
                </Label>
                <Input
                  id="set-end"
                  type="time"
                  value={profile.defEnd}
                  onChange={(e) => onUpdate(profile.id, { defEnd: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div className="flex items-center gap-2 pb-2">
              <Switch
                id="set-lunch"
                checked={profile.defLunch}
                onCheckedChange={(v) => onUpdate(profile.id, { defLunch: v })}
              />
              <Label htmlFor="set-lunch" className="text-sm">
                Обед
              </Label>
            </div>
            {profile.defLunch && (
              <div className="w-[130px] space-y-1.5">
                <Label className="text-xs">Длительность</Label>
                <Select
                  value={String(profile.defLunchMin)}
                  onValueChange={(v) => onUpdate(profile.id, { defLunchMin: Number(v) })}
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
              <Label htmlFor="set-place" className="text-xs">
                Место
              </Label>
              <Input
                id="set-place"
                value={profile.defPlace}
                onChange={(e) => onUpdate(profile.id, { defPlace: e.target.value })}
                placeholder="Склад"
                maxLength={60}
              />
            </div>
          </div>

          <Separator />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Пинкод входа</p>
              <p className="text-xs text-muted-foreground">
                6 цифр, которыми вы входите в этот профиль
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setPinOpen(true)}>
              <KeyRound /> Сменить пинкод
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* смена пинкода: текущий → новый → повтор */}
      <Dialog open={pinOpen} onOpenChange={setPinOpen}>
        <DialogContent className="max-w-sm">
          <DialogTitle className="sr-only">Смена пинкода</DialogTitle>
          <DialogDescription className="sr-only">
            Введите текущий пинкод, затем новый дважды
          </DialogDescription>
          <PinFlow
            key="change-pin"
            collectCurrent
            confirmNew
            currentTitle="Введите текущий пинкод"
            currentDescription="Так вы подтверждаете, что это ваш профиль"
            newTitle="Придумайте новый пинкод"
            newDescription="6 цифр — ими вы будете входить"
            onSubmit={({ current, next }) => onChangePin(current ?? '', next)}
            onDone={() => setPinOpen(false)}
            onCancel={() => setPinOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
