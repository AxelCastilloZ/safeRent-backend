import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isEmail } from 'class-validator';

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
  private readonly templateId: number;

  constructor(config: ConfigService) {
    this.apiKey = config.getOrThrow<string>('BREVO_API_KEY').trim();
    this.senderEmail = config.getOrThrow<string>('BREVO_SENDER_EMAIL').trim();
    this.senderName = config.getOrThrow<string>('BREVO_SENDER_NAME').trim();
    this.templateId = Number(config.getOrThrow('BREVO_RESET_TEMPLATE_ID'));
    this.ttlMinutes = Number(config.get('PASSWORD_RESET_TTL_MINUTES', 15));
    const url = new URL(config.getOrThrow<string>('FRONTEND_URL'));
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      !this.apiKey ||
      !isEmail(this.senderEmail) ||
      !this.senderName ||
      !Number.isSafeInteger(this.templateId) ||
      this.templateId <= 0 ||
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

  async sendPasswordReset(email: string, token: string) {
    const resetUrl = new URL('/reset-password', this.frontendOrigin);
    resetUrl.searchParams.set('token', token);
    let response: Response;
    try {
      response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
        headers: { 'api-key': this.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: { email: this.senderEmail, name: this.senderName },
          to: [{ email }],
          templateId: this.templateId,
          params: {
            RESET_URL: resetUrl.toString(),
            EXPIRES_MINUTES: this.ttlMinutes,
          },
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
