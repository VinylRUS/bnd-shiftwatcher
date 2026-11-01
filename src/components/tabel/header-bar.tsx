'use client'

import { useTheme } from 'next-themes'
import { Clock3, Moon, Settings2, Sun, UserRoundPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useMounted } from '@/hooks/use-mounted'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Profile } from '@/lib/tabel'

const ADD_VALUE = '__add__'

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useMounted()
  if (!mounted) return <Button variant="ghost" size="icon" className="opacity-0" aria-hidden />
  const dark = resolvedTheme === 'dark'
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      title={dark ? 'Светлая тема' : 'Тёмная тема'}
      aria-label={dark ? 'Включить светлую тему' : 'Включить тёмную тему'}
    >
      {dark ? <Sun className="size-4.5" /> : <Moon className="size-4.5" />}
    </Button>
  )
}

type Props = {
  profiles: Profile[]
  activeId: string
  onSwitch: (id: string) => void
  onAddProfile: () => void
  onOpenSettings: () => void
}

export function HeaderBar({ profiles, activeId, onSwitch, onAddProfile, onOpenSettings }: Props) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
          <Clock3 className="size-5" />
        </div>
        <div className="min-w-0 leading-tight">
          <div className="truncate font-semibold tracking-tight">Табель</div>
          <div className="hidden text-xs text-muted-foreground sm:block">
            учёт рабочих часов и ЗП
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <Select
            value={activeId}
            onValueChange={(v) => {
              if (v === ADD_VALUE) onAddProfile()
              else onSwitch(v)
            }}
          >
            <SelectTrigger
              className="w-[132px] sm:w-[190px]"
              aria-label="Выбор профиля"
              title={profiles.find((p) => p.id === activeId)?.name}
            >
              <SelectValue placeholder="Профиль" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel className="text-muted-foreground">Профили</SelectLabel>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="max-w-[240px] truncate">
                    {p.name}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectSeparator />
              <SelectItem value={ADD_VALUE} className="text-emerald-700 dark:text-emerald-400">
                <UserRoundPlus className="size-4" /> Новый профиль
              </SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenSettings}
            title="Настройки профиля"
            aria-label="Настройки профиля"
          >
            <Settings2 className="size-4.5" />
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
