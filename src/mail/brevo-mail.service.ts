import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isEmail } from 'class-validator';
import es from './locales/es.json';
import en from './locales/en.json';
import fr from './locales/fr.json';
import pt from './locales/pt.json';
import { requestLanguage } from '../common/language';

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
    let response: Response;
    try {
      response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
        headers: { 'api-key': this.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: { email: this.senderEmail, name: this.senderName },
          to: [{ email }],
          subject: text.subject,
          htmlContent,
          textContent: [text.title, text.intro, resetUrl.toString(), expires, text.ignore, text.footer].join('\n\n'),
        }),
      });
    } catch {
      throw new BrevoDeliveryError(true);
    }
    // Do not log the provider response, recipient, credentials or reset URL.
    if (!response.ok)
      throw new BrevoDeliveryError(
        response.status === 429 || response.status >= 500,
        response.status,
      );
  }
}
