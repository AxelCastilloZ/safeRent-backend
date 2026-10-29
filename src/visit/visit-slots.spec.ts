import { addDays, daySlots, DEFAULT_RULES, DEFAULT_TIMEZONE, isDateKey, isHalfHour, isOfferedSlot, isValidTimezone, listSlots, localParts, zonedTimeToUtc } from './visit-slots';

describe('Visit slots', () => {
  const CR = DEFAULT_TIMEZONE; // UTC-6 todo el año

  describe('time zones', () => {
    it('converts local times to UTC and back', () => {
      const instant = zonedTimeToUtc('2026-11-17', '09:00', CR);
      expect(instant.toISOString()).toBe('2026-11-17T15:00:00.000Z');
      expect(localParts(instant, CR)).toEqual({ date: '2026-11-17', time: '09:00', weekday: 2 });
    });

    it('moves the local date when UTC is already the next day', () => {
      const instant = new Date('2026-11-18T03:30:00Z'); // 21:30 del día 17 en Costa Rica
      expect(localParts(instant, CR)).toMatchObject({ date: '2026-11-17', time: '21:30' });
    });

    it('handles daylight saving time (America/New_York)', () => {
      expect(zonedTimeToUtc('2026-01-15', '09:00', 'America/New_York').toISOString()).toBe('2026-01-15T14:00:00.000Z');
      expect(zonedTimeToUtc('2026-07-15', '09:00', 'America/New_York').toISOString()).toBe('2026-07-15T13:00:00.000Z');
    });

    it('validates zones and date keys', () => {
      expect(isValidTimezone('America/Costa_Rica')).toBe(true);
      expect(isValidTimezone('Mars/Olympus')).toBe(false);
      expect(isDateKey('2026-02-30')).toBe(false);
      expect(isDateKey('2026-11-17')).toBe(true);
      expect(isHalfHour('09:30')).toBe(true);
      expect(isHalfHour('09:15')).toBe(false);
    });

    it('adds days across month ends', () => {
      expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
      expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    });
  });

  describe('daily slots', () => {
    it('offers 16 half-hour slots from 9:00 to 17:00 on a working day, and none on Sunday', () => {
      const monday = daySlots('2026-11-16', DEFAULT_RULES, CR);
      expect(monday).toHaveLength(16);
      expect(localParts(monday[0], CR).time).toBe('09:00');
      expect(localParts(monday[15], CR).time).toBe('16:30');
      expect(daySlots('2026-11-15', DEFAULT_RULES, CR)).toHaveLength(0);
    });

    it('supports several windows in one day', () => {
      const rules = [{ weekday: 1, start: '08:00', end: '09:00' }, { weekday: 1, start: '14:00', end: '15:00' }];
      expect(daySlots('2026-11-16', rules, CR).map((slot) => localParts(slot, CR).time)).toEqual(['08:00', '08:30', '14:00', '14:30']);
    });

    it('skips local times that do not exist when the clock jumps forward', () => {
      const rules = [{ weekday: 0, start: '01:30', end: '03:30' }]; // domingo 8 de marzo de 2026 en Nueva York
      const times = daySlots('2026-03-08', rules, 'America/New_York').map((slot) => localParts(slot, 'America/New_York').time);
      expect(times).toEqual(['01:30', '03:00']);
    });

    it('recognizes only exact offered starts', () => {
      expect(isOfferedSlot(new Date('2026-11-17T15:00:00Z'), DEFAULT_RULES, CR)).toBe(true); // 09:00
      expect(isOfferedSlot(new Date('2026-11-17T15:15:00Z'), DEFAULT_RULES, CR)).toBe(false); // 09:15
      expect(isOfferedSlot(new Date('2026-11-17T23:00:00Z'), DEFAULT_RULES, CR)).toBe(false); // 17:00 ya es el cierre
      expect(isOfferedSlot(new Date('2026-11-15T15:00:00Z'), DEFAULT_RULES, CR)).toBe(false); // domingo
    });
  });

  describe('calendar listing', () => {
    const now = new Date('2026-11-16T15:00:00Z'); // lunes 9:00 en Costa Rica

    it('hides past slots, marks the next hour as unavailable and marks held slots', () => {
      const held = new Set([new Date('2026-11-16T21:00:00Z').getTime()]); // 15:00 locales
      const slots = listSlots({ from: '2026-11-16', to: '2026-11-16', rules: DEFAULT_RULES, timezone: CR, now, occupied: held });
      const byTime = Object.fromEntries(slots.map((slot) => [slot.localTime, slot.available]));
      expect(byTime['09:00']).toBeUndefined(); // ya empezó
      expect(byTime['09:30']).toBe(false); // falta menos de una hora
      expect(byTime['10:00']).toBe(true);
      expect(byTime['15:00']).toBe(false); // retenido por otra persona
      expect(slots.every((slot) => slot.localDate === '2026-11-16')).toBe(true);
    });

    it('does not offer anything beyond 60 days', () => {
      const slots = listSlots({ from: '2027-01-10', to: '2027-01-20', rules: DEFAULT_RULES, timezone: CR, now, occupied: new Set() });
      expect(slots.every((slot) => new Date(slot.start).getTime() <= now.getTime() + 60 * 86_400_000)).toBe(true);
      expect(slots.some((slot) => slot.localDate === '2027-01-20')).toBe(false);
    });
  });
});
