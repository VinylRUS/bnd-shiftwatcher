'use client'

// Пинкод-клавиатура: точки-индикаторы, цифровые кнопки и «флоу» ввода.
//
// PinFlow — конечный автомат из шагов:
//   [текущий пин] → [новый пин] → [повтор нового] → отправка
// Шаги включаются пропсами:
//   вход по пину:            confirmNew=false
//   задать пин (первый раз): confirmNew=true
//   сменить свой пин:        collectCurrent + confirmNew
// Ввод завершается сам на 6-й цифре; ошибки — встряска и красные точки.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Delete } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type PinSubmitResult = { ok: boolean; error?: string; code?: string }
export type PinSubmitPayload = { current?: string; next: string }

const PIN_LEN = 6

// ─── точки-индикаторы ───────────────────────────────────────────────────────

export function PinDots({ filled, error }: { filled: number; error?: boolean }) {
  return (
    <div
      className="flex items-center justify-center gap-3.5"
      role="status"
      aria-label={`Введено ${filled} из ${PIN_LEN} цифр`}
    >
      {Array.from({ length: PIN_LEN }).map((_, i) => (
        <span
          key={i}
          className={cn(
            'size-3.5 rounded-full border-2 transition-all duration-150',
            i < filled
              ? error
                ? 'scale-110 border-destructive bg-destructive'
                : 'scale-110 border-emerald-600 bg-emerald-600 dark:border-emerald-500 dark:bg-emerald-500'
              : 'border-muted-foreground/35 bg-transparent',
          )}
        />
      ))}
    </div>
  )
}

// ─── клавиатура ─────────────────────────────────────────────────────────────

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'] as const

export function PinKeypad({
  onDigit,
  onBack,
  disabled,
}: {
  onDigit: (d: string) => void
  onBack: () => void
  disabled?: boolean
}) {
  return (
    <div className="mx-auto grid w-full max-w-[270px] grid-cols-3 gap-2.5">
      {KEYS.map((k, i) =>
        k === '' ? (
          <span key={i} aria-hidden />
        ) : k === 'back' ? (
          <Button
            key={i}
            type="button"
            variant="ghost"
            disabled={disabled}
            onClick={onBack}
            aria-label="Стереть цифру"
            className="h-14 rounded-2xl text-muted-foreground active:scale-95"
          >
            <Delete className="size-5" />
          </Button>
        ) : (
          <Button
            key={i}
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => onDigit(k)}
            aria-label={`Цифра ${k}`}
            className="h-14 rounded-2xl text-xl font-semibold tabular-nums active:scale-95"
          >
            {k}
          </Button>
        ),
      )}
    </div>
  )
}

// ─── флоу ввода ─────────────────────────────────────────────────────────────

type PinFlowProps = {
  /** шаг «текущий пинкод» (для смены своего пина) */
  collectCurrent?: boolean
  currentTitle?: string
  currentDescription?: string
  /** шаг нового пина */
  newTitle: string
  newDescription?: string
  /** попросить повторить новый пин (по умолчанию — да) */
  confirmNew?: boolean
  onSubmit: (pin: PinSubmitPayload) => Promise<PinSubmitResult>
  onDone?: () => void
  onCancel?: () => void
  cancelLabel?: string
}

export function PinFlow({
  collectCurrent = false,
  currentTitle = 'Введите текущий пинкод',
  currentDescription,
  newTitle,
  newDescription,
  confirmNew = true,
  onSubmit,
  onDone,
  onCancel,
  cancelLabel = 'Отмена',
}: PinFlowProps) {
  const [step, setStep] = useState<'current' | 'new' | 'repeat'>(collectCurrent ? 'current' : 'new')
  const [digits, setDigits] = useState('')
  const [currentPin, setCurrentPin] = useState('')
  const [firstNew, setFirstNew] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  busyRef.current = busy

  const fail = useCallback((msg: string) => {
    setError(msg)
    setShake(true)
    setTimeout(() => setShake(false), 500)
  }, [])

  const push = useCallback((d: string) => {
    if (busyRef.current) return
    setError(null)
    setDigits((v) => (v.length >= PIN_LEN ? v : v + d))
  }, [])

  const back = useCallback(() => {
    if (busyRef.current) return
    setError(null)
    setDigits((v) => v.slice(0, -1))
  }, [])

  // финальная отправка на сервер
  const finish = useCallback(
    async (pin: string) => {
      setBusy(true)
      try {
        const r = await onSubmit({
          current: collectCurrent ? currentPin || undefined : undefined,
          next: pin,
        })
        setDigits('')
        if (r.ok) {
          onDone?.()
          return
        }
        fail(r.error ?? 'Что-то пошло не так — попробуйте ещё раз')
        if (r.code === 'BAD_CURRENT') {
          // неверный текущий пин — возвращаемся к его вводу
          setCurrentPin('')
          setStep(collectCurrent ? 'current' : 'new')
        } else if (step === 'repeat') {
          setStep('new')
        }
      } finally {
        setBusy(false)
      }
    },
    [collectCurrent, currentPin, fail, onDone, onSubmit, step],
  )

  // 6-я цифра — обрабатываем шаг
  const handleFull = useCallback(
    async (pin: string) => {
      if (step === 'current') {
        setCurrentPin(pin)
        setDigits('')
        setStep('new')
        return
      }
      if (step === 'new' && confirmNew) {
        setFirstNew(pin)
        setDigits('')
        setStep('repeat')
        return
      }
      if (step === 'repeat' && pin !== firstNew) {
        fail('Пинкоды не совпадают — введите новый ещё раз')
        setDigits('')
        setStep('new')
        return
      }
      await finish(pin)
    },
    [confirmNew, fail, finish, firstNew, step],
  )

  // автосабмит на 6-й цифре
  useEffect(() => {
    if (digits.length !== PIN_LEN || busy) return
    const t = setTimeout(() => void handleFull(digits), 180)
    return () => clearTimeout(t)
  }, [digits, busy, handleFull])

  // физическая клавиатура
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      if (/^[0-9]$/.test(e.key)) {
        push(e.key)
      } else if (e.key === 'Backspace') {
        back()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [push, back])

  const title =
    step === 'current' ? currentTitle : step === 'repeat' ? 'Повторите пинкод' : newTitle
  const description =
    step === 'current'
      ? currentDescription
      : step === 'repeat'
        ? 'Введите те же 6 цифр ещё раз'
        : newDescription

  return (
    <div className={cn('space-y-5 select-none', shake && 'animate-shake')}>
      <div className="space-y-1.5 text-center">
        <h2 className="text-lg font-semibold leading-tight tracking-tight">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>

      <div className={cn('py-1', busy && 'animate-pulse')}>
        <PinDots filled={digits.length} error={!!error} />
      </div>

      <p className="min-h-5 text-center text-sm font-medium text-destructive" role="alert">
        {error ?? ''}
      </p>

      <PinKeypad onDigit={push} onBack={back} disabled={busy} />

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="mx-auto block text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          {cancelLabel}
        </button>
      )}
    </div>
  )
}
