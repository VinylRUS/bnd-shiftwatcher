'use client'

// Экран входа в Табель.
//   первый запуск  → создание профиля администратора (имя) → пин;
//   обычный вход   → пинкод профиля;
//   первый вход по имени (профиль без пина) → сразу «Придумайте пинкод».
// Все переходы внутри одного экрана, состояние не покидает компонент.

import { useState } from 'react'
import { ArrowLeft, Clock3, Loader2, UserRoundPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PinFlow } from '@/components/tabel/pin-pad'
import { useTabel } from '@/lib/store'

type Mode = 'pin' | 'name' | 'setup' | 'setPin'

export function LoginScreen() {
  const firstRun = useTabel((s) => s.firstRun)
  const serverDown = useTabel((s) => s.serverDown)
  const loginByPin = useTabel((s) => s.loginByPin)
  const loginByName = useTabel((s) => s.loginByName)
  const setupFirst = useTabel((s) => s.setupFirst)
  const setPinFor = useTabel((s) => s.setPinFor)

  const [userMode, setUserMode] = useState<Mode | null>(null)
  const [pendingName, setPendingName] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // режим выводится из состояния: первый запуск → создание админа,
  // иначе — пин; userMode — явный выбор пользователя (ссылки/кнопки)
  const mode: Mode = userMode ?? (firstRun ? 'setup' : 'pin')

  const submitName = async () => {
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError(null)
    const r = await loginByName(trimmed)
    setBusy(false)
    if (r.ok && r.needPin) {
      setPendingName(trimmed)
      setUserMode('setPin')
      return
    }
    if (!r.ok) setError(r.error ?? 'Не удалось выполнить вход')
  }

  const submitSetup = async () => {
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError(null)
    const r = await setupFirst(trimmed)
    setBusy(false)
    if (r.ok && r.needPin) {
      setPendingName(trimmed)
      setUserMode('setPin')
      return
    }
    if (!r.ok) setError(r.error ?? 'Не удалось создать профиль')
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
          <Clock3 className="size-7" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Табель</h1>
          <p className="text-sm text-muted-foreground">учёт рабочих часов и ЗП</p>
        </div>
      </div>

      <Card className="w-full max-w-sm border-border/70 shadow-sm">
        <CardContent className="p-6">
          {serverDown ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Сервер недоступен — проверьте соединение и обновите страницу.
            </p>
          ) : mode === 'pin' ? (
            <>
              <PinFlow
                key="login"
                confirmNew={false}
                newTitle="Введите пинкод"
                newDescription="6 цифр вашего профиля"
                onSubmit={({ next }) => loginByPin(next)}
              />
              <div className="mt-5 border-t pt-4 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setUserMode('name')
                    setName('')
                    setError(null)
                  }}
                  className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                >
                  Первый вход по имени профиля
                </button>
                <p className="mt-1.5 text-xs text-muted-foreground/80">
                  если пинкод ещё не задан — его предложат установить
                </p>
              </div>
            </>
          ) : mode === 'name' ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                void submitName()
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="login-name">Имя профиля</Label>
                <Input
                  id="login-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="напр. Олеся"
                  autoFocus
                  autoComplete="off"
                  maxLength={60}
                />
              </div>
              {error && (
                <p className="text-sm font-medium text-destructive" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={!name.trim() || busy}>
                {busy && <Loader2 className="animate-spin" />} Продолжить
              </Button>
              <button
                type="button"
                onClick={() => {
                  setUserMode('pin')
                  setError(null)
                }}
                className="mx-auto flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                <ArrowLeft className="size-3.5" /> Назад к пинкоду
              </button>
            </form>
          ) : mode === 'setup' ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                void submitSetup()
              }}
            >
              <div className="space-y-1.5">
                <h2 className="text-lg font-semibold leading-tight tracking-tight">
                  Первый запуск
                </h2>
                <p className="text-sm text-muted-foreground">
                  Создайте профиль администратора — он сможет добавлять профили коллег и
                  управлять ими. Сразу после создания вы зададите пинкод.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="setup-name">Имя профиля</Label>
                <Input
                  id="setup-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="напр. Егор"
                  autoFocus
                  autoComplete="off"
                  maxLength={60}
                />
              </div>
              {error && (
                <p className="text-sm font-medium text-destructive" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={!name.trim() || busy}>
                {busy ? <Loader2 className="animate-spin" /> : <UserRoundPlus />}
                Создать профиль
              </Button>
            </form>
          ) : (
            /* mode === 'setPin' */
            <PinFlow
              key={`set-${pendingName}`}
              confirmNew
              newTitle="Придумайте пинкод"
              newDescription={`Профиль «${pendingName}» — эти 6 цифр понадобятся для входа`}
              onSubmit={({ next }) => setPinFor(pendingName, next)}
              onCancel={() => {
                setUserMode(firstRun ? 'setup' : 'name')
                setName('')
              }}
              cancelLabel="Выбрать другой профиль"
            />
          )}
        </CardContent>
      </Card>

      <p className="max-w-sm text-center text-xs text-muted-foreground">
        У каждого профиля — свой пинкод. Профили создаёт администратор.
      </p>
    </div>
  )
}
