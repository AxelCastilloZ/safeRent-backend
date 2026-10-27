import { ConfigService } from '@nestjs/config';
import { BrevoMailService } from '../mail/brevo-mail.service';
import { buildDigestEmail, buildVisitEmail, EMAIL_RECIPIENT, formatWhen, type VisitEmailEvent } from './visit-emails';

const EVENTS = Object.keys(EMAIL_RECIPIENT) as VisitEmailEvent[];
const LANGUAGES = ['es', 'en', 'fr', 'pt'];
const when = new Date('2026-11-17T16:00:00Z'); // 10:00 en Costa Rica
const data = { person: 'Ana Pérez', property: 'Casa en Nicoya', when, timezone: 'America/Costa_Rica', previous: new Date('2026-11-17T16:30:00Z') };

describe('Visit emails', () => {
  it.each(LANGUAGES)('fills every placeholder of every event in %s', (language) => {
    for (const event of EVENTS) {
      const email = buildVisitEmail(event, { ...data, reason: 'Motivo de prueba' }, language);
      const everything = [email.subject, email.title, email.footer, email.button.label, ...email.paragraphs].join(' ');
      expect(everything).not.toMatch(/{{|}}/);
      expect(everything).toContain('Ana Pérez');
      expect(email.subject.trim()).not.toBe('');
      expect(email.paragraphs.at(-1)).toContain('Motivo de prueba');
    }
  });

  it('sends each event to the other person and links to the right area', () => {
    expect(EMAIL_RECIPIENT).toEqual({
      REQUESTED: 'owner', ACCEPTED: 'owner', CANCELLED_BY_TENANT: 'owner',
      CONFIRMED: 'tenant', PROPOSED: 'tenant', CANCELLED_BY_OWNER: 'tenant',
    });
    expect(buildVisitEmail('REQUESTED', data, 'es').button.path).toBe('/dashboard/owner/visits');
    expect(buildVisitEmail('CONFIRMED', data, 'es').button.path).toBe('/dashboard/visits');
  });

  it('writes the visit time in the property time zone and the reader language', () => {
    expect(formatWhen(when, 'America/Costa_Rica', 'es')).toContain('10:00');
    expect(formatWhen(when, 'America/Costa_Rica', 'es')).toMatch(/octubre|noviembre/);
    expect(formatWhen(when, 'America/Costa_Rica', 'en')).toMatch(/November/);
    expect(formatWhen(when, 'America/Costa_Rica', 'fr')).toMatch(/novembre/);
    expect(formatWhen(when, 'America/New_York', 'en')).toContain('11:00'); // la misma hora, vista en Nueva York
  });

  it('falls back to Spanish for an unknown language', () => {
    expect(buildVisitEmail('REQUESTED', data, 'de').title).toBe('Tienes una nueva solicitud de cita');
    expect(buildVisitEmail('REQUESTED', data, null).title).toBe('Tienes una nueva solicitud de cita');
  });

  it('builds a digest with the right plural', () => {
    const digest = { person: 'Ana Pérez', property: 'Casa', when, timezone: 'America/Costa_Rica' };
    expect(buildDigestEmail({ ...digest, count: 1 }, 'es').subject).toBe('Tienes 1 solicitud de cita por responder');
    expect(buildDigestEmail({ ...digest, count: 3 }, 'es').subject).toBe('Tienes 3 solicitudes de cita por responder');
    expect(buildDigestEmail({ ...digest, count: 3 }, 'en').subject).toBe('You have 3 visit requests awaiting a reply');
    expect(buildDigestEmail({ ...digest, count: 1 }, 'es').button.path).toBe('/dashboard/owner/visits');
  });
});

describe('Brevo notification transport', () => {
  const settings = {
    BREVO_API_KEY: 'k', BREVO_SENDER_EMAIL: 'sender@example.com', BREVO_SENDER_NAME: 'SafeRent',
    PASSWORD_RESET_TTL_MINUTES: '15', FRONTEND_URL: 'http://localhost:5173',
  };
  afterEach(() => jest.restoreAllMocks());

  it('escapes user-provided text and links to the frontend with the language', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 201 } as Response);
    const content = buildVisitEmail('REQUESTED', { ...data, property: '<script>alert(1)</script>', person: 'A & B' }, 'es');
    await new BrevoMailService(new ConfigService(settings)).sendNotification('owner@example.com', 'es', content);
    const payload = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(payload.to).toEqual([{ email: 'owner@example.com' }]);
    expect(payload.htmlContent).not.toContain('<script>');
    expect(payload.htmlContent).toContain('&lt;script&gt;');
    expect(payload.htmlContent).toContain('A &amp; B');
    expect(payload.htmlContent).toContain('http://localhost:5173/dashboard/owner/visits?lang=es');
    expect(payload.textContent).toContain('http://localhost:5173/dashboard/owner/visits?lang=es');
  });

  it('reports transient delivery failures without exposing provider data', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 503 } as Response);
    const content = buildVisitEmail('REQUESTED', data, 'es');
    await expect(new BrevoMailService(new ConfigService(settings)).sendNotification('o@example.com', 'es', content))
      .rejects.toMatchObject({ retryable: true, status: 503 });
  });
});
