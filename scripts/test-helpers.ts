// Вспомогательные функции для тестов
import type { Profile } from '../src/lib/tabel'

export { buildExport, exportLine, dayHours } from '../src/lib/tabel'

export function makeTestProfile(): Profile {
  return {
    id: 'test',
    name: 'Иван',
    rate: 500,
    defStart: '09:00',
    defEnd: '18:00',
    defLunch: true,
    defLunchMin: 60,
    defPlace: 'Склад',
    months: {},
  }
}
