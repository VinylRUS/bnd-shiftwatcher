'use client'

import { useTheme } from 'next-themes'
import { Clock3, LogOut, Moon, Settings2, Sun, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useMounted } from '@/hooks/use-mounted'
import { cn } from '@/lib/utils'

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
  /** свой профиль (сессия) */
  profile: { id: string; name: string }
  isAdmin: boolean
  onOpenSettings: () => void
  onOpenAdmin: () => void
  onLogout: () => void
}

export function HeaderBar({ profile, isAdmin, onOpenSettings, onOpenAdmin, onLogout }: Props) {
  const initial = profile.name.slice(0, 1).toUpperCase()
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

        <div className="ml-auto flex items-center gap-1">
          {/* кто в системе */}
          <div
            className="flex min-w-0 items-center gap-2 rounded-full border bg-card py-1 pl-1 pr-3 shadow-sm"
            title={isAdmin ? 'Вы вошли как администратор' : 'Ваш профиль'}
          >
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                isAdmin ? 'bg-emerald-600 text-white' : 'bg-muted text-muted-foreground',
              )}
            >
              {initial}
            </span>
            <span className="max-w-[88px] truncate text-sm font-medium sm:max-w-[160px]">
              {profile.name}
            </span>
          </div>

          {isAdmin && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onOpenAdmin}
              title="Профили и доступы"
              aria-label="Профили и доступы"
            >
              <Users className="size-4.5" />
            </Button>
          )}

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
          <Button
            variant="ghost"
            size="icon"
            onClick={onLogout}
            title="Выйти из профиля"
            aria-label="Выйти из профиля"
          >
            <LogOut className="size-4.5" />
          </Button>
        </div>
      </div>
    </header>
  )
}
