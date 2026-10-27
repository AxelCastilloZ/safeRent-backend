import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isEmail } from 'class-validator';
import es from './locales/es.json';
import en from './locales/en.json';
import fr from './locales/fr.json';
import pt from './locales/pt.json';
import { requestLanguage } from '../common/language';

export interface NotificationContent {
  subject: string;
  title: string;
  paragraphs: string[];
  /** `path` es relativo al frontend (por ejemplo "/dashboard/visits"). */
  button: { label: string; path: string };
  footer: string;
}

export class BrevoDeliveryError extends Error {
  constructor(
    public readonly retryable: boolean,
    public readonly status?: number,
  ) {
    super('No se pudo enviar el correo de recuperación.');
  }
}
@Injectable()
export class BrevoMailService {
  readonly ttlMinutes: number;
  readonly frontendOrigin: string;
  private readonly apiKey: string;
  private readonly senderEmail: string;
  private readonly senderName: string;

  constructor(config: ConfigService) {
    this.apiKey = config.getOrThrow<string>('BREVO_API_KEY').trim();
    this.senderEmail = config.getOrThrow<string>('BREVO_SENDER_EMAIL').trim();
    this.senderName = config.getOrThrow<string>('BREVO_SENDER_NAME').trim();
    this.ttlMinutes = Number(config.get('PASSWORD_RESET_TTL_MINUTES', 15));
    const url = new URL(config.getOrThrow<string>('FRONTEND_URL'));
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      !this.apiKey ||
      !isEmail(this.senderEmail) ||
      !this.senderName ||
      !Number.isInteger(this.ttlMinutes) ||
      this.ttlMinutes < 1 ||
      this.ttlMinutes > 60 ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/' ||
      !(url.protocol === 'https:' || (local && url.protocol === 'http:'))
    ) {
      throw new Error(
        'Configuración de recuperación/Brevo inválida. Revisa las variables del backend.',
      );
    }
    this.frontendOrigin = url.origin;
  }

  async sendPasswordReset(email: string, token: string, preferredLanguage?: string | null) {
    const language = requestLanguage(preferredLanguage);
    const text = { es, en, fr, pt }[language];
    const resetUrl = new URL('/reset-password', this.frontendOrigin);
    resetUrl.searchParams.set('token', token);
    resetUrl.searchParams.set('lang', language);
    const expires = (new Intl.PluralRules(language).select(this.ttlMinutes) === 'one' ? text.expires_one : text.expires_other).replace('{{minutes}}', String(this.ttlMinutes));
    const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
    const htmlContent = `<!doctype html><html lang="${language}"><body style="font-family:Arial,sans-serif;color:#0a2540;padding:24px"><h1>${escape(text.title)}</h1><p>${escape(text.intro)}</p><p><a href="${escape(resetUrl.toString())}">${escape(text.button)}</a></p><p>${escape(expires)}</p><p>${escape(text.ignore)}</p><footer>${escape(text.footer)}</footer></body></html>`;
    await this.deliver(email, text.subject, htmlContent, [text.title, text.intro, resetUrl.toString(), expires, text.ignore, text.footer].join('\n\n'));
  }

  /** Aviso transaccional genérico (citas, etc.): título, párrafos y un botón. Todo el texto se escapa antes de ir al HTML. */
  async sendNotification(to: string, language: string, content: NotificationContent) {
    const lang = requestLanguage(language);
    const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
    const url = new URL(content.button.path, this.frontendOrigin);
    url.searchParams.set('lang', lang);
    const paragraphs = content.paragraphs.map(paragraph => `<p>${escape(paragraph)}</p>`).join('');
    const htmlContent = `<!doctype html><html lang="${lang}"><body style="font-family:Arial,sans-serif;color:#0a2540;padding:24px"><h1>${escape(content.title)}</h1>${paragraphs}<p><a href="${escape(url.toString())}" style="display:inline-block;background:#0f766e;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${escape(content.button.label)}</a></p><footer style="color:#5b6474;font-size:12px">${escape(content.footer)}</footer></body></html>`;
    const textContent = [content.title, ...content.paragraphs, `${content.button.label}: ${url.toString()}`, content.footer].join('\n\n');
    await this.deliver(to, content.subject, htmlContent, textContent);
  }

  private async deliver(email: string, subject: string, htmlContent: string, textContent: string) {
    let response: Response;
    try {
      response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
        headers: { 'api-key': this.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: { email: this.senderEmail, name: this.senderName },
          to: [{ email }],
          subject,
          htmlContent,
          textContent,
        }),
      });
    } catch {
      throw new BrevoDeliveryError(true);
    }
    // Do not log the provider response, recipient, credentials or links.
    if (!response.ok)
      throw new BrevoDeliveryError(
        response.status === 429 || response.status >= 500,
        response.status,
      );
  }
}
