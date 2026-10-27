import { requestLanguage } from '../common/language';
import type { NotificationContent } from '../mail/brevo-mail.service';
import es from '../mail/locales/es.json';
import en from '../mail/locales/en.json';
import fr from '../mail/locales/fr.json';
import pt from '../mail/locales/pt.json';

export type ReservationEmailEvent = 'CONFIRMED' | 'RELEASED';

export function buildReservationEmail(
  event: ReservationEmailEvent,
  data: { property: string; person: string; reason?: string },
  languageInput: string | null | undefined,
  recipient: 'owner' | 'tenant',
): NotificationContent {
  const text: Record<string, string> = { es, en, fr, pt }[requestLanguage(languageInput)];
  const fill = (template: string) => template.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => data[key as keyof typeof data] ?? '');
  const key = `reservation_${event}_${recipient}`;
  const paragraphs = [fill(text[`${key}_body`])];
  if (event === 'RELEASED' && data.reason) paragraphs.push(fill(text.visit_reasonLine));
  return {
    subject: fill(text[`${key}_subject`]),
    title: text[`${key}_title`],
    paragraphs,
    button: {
      label: text[`reservation_${recipient}_button`],
      path: recipient === 'owner' ? '/dashboard/owner/properties' : '/dashboard/reservations',
    },
    footer: text.reservation_footer,
  };
}
