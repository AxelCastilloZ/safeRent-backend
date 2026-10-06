import { ConfigService } from '@nestjs/config';
import { BrevoDeliveryError, BrevoMailService } from './brevo-mail.service';

const settings = {
  BREVO_API_KEY: 'test-api-key',
  BREVO_SENDER_EMAIL: 'sender@example.com',
  BREVO_SENDER_NAME: 'SafeRent',
  BREVO_RESET_TEMPLATE_ID: '12',
  PASSWORD_RESET_TTL_MINUTES: '15',
  FRONTEND_URL: 'http://localhost:5173',
};

describe('Brevo recovery transport', () => {
  afterEach(() => jest.restoreAllMocks());
  it('sends the stored recipient and configured frontend link through the template', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 201 } as Response);
    await new BrevoMailService(new ConfigService(settings)).sendPasswordReset(
      'account@example.com',
      'unique_token',
    );
    const payload = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(payload).toMatchObject({
      to: [{ email: 'account@example.com' }],
      templateId: 12,
      params: {
        RESET_URL: 'http://localhost:5173/reset-password?token=unique_token',
        EXPIRES_MINUTES: 15,
      },
    });
  });
  it.each([429, 500, 503])(
    'retries transient HTTP %i without exposing provider data',
    async (status) => {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValue({ ok: false, status } as Response);
      await expect(
        new BrevoMailService(new ConfigService(settings)).sendPasswordReset(
          'a@example.com',
          'token',
        ),
      ).rejects.toMatchObject({ retryable: true, status });
    },
  );
  it('does not retry rejected API credentials', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: false, status: 401 } as Response);
    await expect(
      new BrevoMailService(new ConfigService(settings)).sendPasswordReset(
        'a@example.com',
        'token',
      ),
    ).rejects.toMatchObject({ retryable: false, status: 401 });
  });
  it('handles transport errors', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('private provider details'));
    await expect(
      new BrevoMailService(new ConfigService(settings)).sendPasswordReset(
        'a@example.com',
        'token',
      ),
    ).rejects.toBeInstanceOf(BrevoDeliveryError);
  });
  it.each([
    { FRONTEND_URL: 'http://unsafe.example' },
    { FRONTEND_URL: 'https://safe.example/redirect' },
    { BREVO_RESET_TEMPLATE_ID: '0' },
    { PASSWORD_RESET_TTL_MINUTES: '100' },
  ])('rejects invalid configuration %o', (override) => {
    expect(
      () =>
        new BrevoMailService(new ConfigService({ ...settings, ...override })),
    ).toThrow();
  });
});
