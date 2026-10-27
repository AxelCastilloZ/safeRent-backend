import type { NotificationContent } from '../mail/brevo-mail.service';
import { requestLanguage } from '../common/language';
import en from '../mail/locales/en.json';
import es from '../mail/locales/es.json';
import fr from '../mail/locales/fr.json';
import pt from '../mail/locales/pt.json';
import { HOLD_HOURS } from './visit.constants';

const TEXTS: Record<string, Record<string, string>> = { es, en, fr, pt };
const LOCALES: Record<string, string> = { es: 'es-CR', en: 'en-US', fr: 'fr-FR', pt: 'pt-BR' };

/** Qué pasó con la cita. Define a quién se le avisa y con qué texto. */
export type VisitEmailEvent = 'REQUESTED' | 'CONFIRMED' | 'PROPOSED' | 'ACCEPTED' | 'CANCELLED_BY_OWNER' | 'CANCELLED_BY_TENANT';

/** A quién le toca el aviso de cada evento: a la otra persona, nunca a quien hizo la acción. */
export const EMAIL_RECIPIENT: Record<VisitEmailEvent, 'owner' | 'tenant'> = {
  REQUESTED: 'owner',
  CONFIRMED: 'tenant',
  PROPOSED: 'tenant',
  ACCEPTED: 'owner',
  CANCELLED_BY_OWNER: 'tenant',
  CANCELLED_BY_TENANT: 'owner',
};

const fill = (template: string, params: Record<string, string | number>) =>
  template.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => String(params[key] ?? ''));

/** "martes, 27 de octubre, 10:00 a. m. GMT-6": la hora de la visita en la zona de la propiedad y en el idioma de quien la lee. */
export function formatWhen(date: Date, timezone: string, language: string): string {
  return new Intl.DateTimeFormat(LOCALES[language] ?? LOCALES.es, {
    weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: timezone, timeZoneName: 'shortOffset',
  }).format(date);
}

export interface VisitEmailData {
  /** La otra persona de la cita (con quien interactúa el destinatario). */
  person: string;
  property: string;
  when: Date;
  previous?: Date | null;
  timezone: string;
  reason?: string | null;
}

export function buildVisitEmail(event: VisitEmailEvent, data: VisitEmailData, languageInput: string | null | undefined): NotificationContent {
  const language = requestLanguage(languageInput);
  const text = TEXTS[language];
  const params = {
    person: data.person,
    property: data.property,
    when: formatWhen(data.when, data.timezone, language),
    previous: data.previous ? formatWhen(data.previous, data.timezone, language) : '',
    hours: HOLD_HOURS,
  };
  const paragraphs = [fill(text[`visit_${event}_body`], params), fill(text[`visit_${event}_note`], params)];
  if (data.reason?.trim()) paragraphs.push(fill(text.visit_reasonLine, { reason: data.reason.trim() }));
  return {
    subject: fill(text[`visit_${event}_subject`], params),
    title: fill(text[`visit_${event}_title`], params),
    paragraphs,
    button: { label: text[`visit_${event}_button`], path: EMAIL_RECIPIENT[event] === 'owner' ? '/dashboard/owner/visits' : '/dashboard/visits' },
    footer: text.visit_footer,
  };
}

export interface DigestData {
  count: number;
  /** La solicitud más antigua sin responder. */
  person: string;
  property: string;
  when: Date;
  timezone: string;
}

/** Resumen para el propietario con solicitudes sin responder (un solo correo, no uno por solicitud). */
export function buildDigestEmail(data: DigestData, languageInput: string | null | undefined): NotificationContent {
  const language = requestLanguage(languageInput);
  const text = TEXTS[language];
  const params = {
    count: data.count, person: data.person, property: data.property, hours: HOLD_HOURS,
    when: formatWhen(data.when, data.timezone, language),
  };
  const plural = new Intl.PluralRules(language).select(data.count) === 'one' ? 'one' : 'other';
  return {
    subject: fill(text[`visit_DIGEST_subject_${plural}`], params),
    title: fill(text.visit_DIGEST_title, params),
    paragraphs: [fill(text.visit_DIGEST_body, params), fill(text.visit_DIGEST_note, params)],
    button: { label: text.visit_DIGEST_button, path: '/dashboard/owner/visits' },
    footer: text.visit_footer,
  };
}
