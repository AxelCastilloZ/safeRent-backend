import { MAX_DAYS_AHEAD, MAX_RANGE_DAYS, MIN_LEAD_MINUTES, SLOT_MINUTES } from './visit.constants';

/** Ventana semanal en la que el propietario atiende citas. `weekday`: 0 = domingo … 6 = sábado. */
export interface AvailabilityRule {
  weekday: number;
  /** "HH:mm" en la zona horaria de la propiedad, en punto o y media. */
  start: string;
  end: string;
}

export interface Slot {
  /** Inicio real (UTC). */
  start: string;
  /** Fecha y hora tal como las ve el propietario, en la zona de la propiedad (para agrupar sin cálculos de zona). */
  localDate: string;
  localTime: string;
  available: boolean;
}

export const DEFAULT_TIMEZONE = 'America/Costa_Rica';
/** Mientras el propietario no configure nada: lunes a sábado, de 9:00 a 17:00. */
export const DEFAULT_RULES: AvailabilityRule[] = [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start: '09:00', end: '17:00' }));

const HALF_HOUR = /^([01]\d|2[0-3]):(00|30)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const isHalfHour = (value: string) => HALF_HOUR.test(value);
/** "YYYY-MM-DD" que existe en el calendario (rechaza, por ejemplo, el 30 de febrero). */
export function isDateKey(value: string): boolean {
  if (!DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

const toMinutes = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const toHm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(timezone: string) {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    formatters.set(timezone, formatter);
  }
  return formatter;
}

/** Hora local de un instante en una zona: fecha, "HH:mm" y día de la semana. */
export function localParts(instant: Date, timezone: string) {
  const parts = formatterFor(timezone).formatToParts(instant);
  const get = (type: string) => Number(parts.find((part) => part.type === type)!.value);
  const [year, month, day, hour, minute] = [get('year'), get('month'), get('day'), get('hour'), get('minute')];
  return {
    date: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

function offsetMs(instant: number, timezone: string): number {
  const parts = formatterFor(timezone).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((part) => part.type === type)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** Instante (UTC) que corresponde a una fecha y hora locales de una zona. */
export function zonedTimeToUtc(date: string, time: string, timezone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  // La segunda pasada corrige las fechas cercanas a un cambio de horario de verano.
  const first = naive - offsetMs(naive, timezone);
  return new Date(naive - offsetMs(first, timezone));
}

export function addDays(date: string, days: number): string {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

/** Inicios de cita de un día concreto según las ventanas semanales. */
export function daySlots(date: string, rules: AvailabilityRule[], timezone: string): Date[] {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const starts: Date[] = [];
  for (const rule of rules.filter((item) => item.weekday === weekday)) {
    for (let minute = toMinutes(rule.start); minute + SLOT_MINUTES <= toMinutes(rule.end); minute += SLOT_MINUTES) {
      const start = zonedTimeToUtc(date, toHm(minute), timezone);
      // Un horario que no existe (salto del reloj) se descarta.
      if (localParts(start, timezone).time === toHm(minute)) starts.push(start);
    }
  }
  return starts.sort((a, b) => a.getTime() - b.getTime());
}

/** ¿Es `instant` exactamente el inicio de una cita posible? */
export function isOfferedSlot(instant: Date, rules: AvailabilityRule[], timezone: string): boolean {
  const { date } = localParts(instant, timezone);
  return daySlots(date, rules, timezone).some((start) => start.getTime() === instant.getTime());
}

interface ListSlotsInput {
  from: string;
  to: string;
  rules: AvailabilityRule[];
  timezone: string;
  now: Date;
  /** Inicios (ms) ya retenidos por otra cita. */
  occupied: Set<number>;
}

/** Horarios de un rango de días, con cuáles siguen libres. No incluye los que ya pasaron ni los demasiado lejanos. */
export function listSlots({ from, to, rules, timezone, now, occupied }: ListSlotsInput): Slot[] {
  const earliest = now.getTime() + MIN_LEAD_MINUTES * 60_000;
  const latest = now.getTime() + MAX_DAYS_AHEAD * 86_400_000;
  const slots: Slot[] = [];
  for (let date = from, count = 0; date <= to && count <= MAX_RANGE_DAYS; date = addDays(date, 1), count += 1) {
    for (const start of daySlots(date, rules, timezone)) {
      const ms = start.getTime();
      if (ms <= now.getTime() || ms > latest) continue;
      slots.push({ start: start.toISOString(), localDate: date, localTime: localParts(start, timezone).time, available: ms >= earliest && !occupied.has(ms) });
    }
  }
  return slots;
}
