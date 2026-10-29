import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { BrevoMailService } from '../mail/brevo-mail.service';
import { buildReservationEmail } from './reservation-emails';
import { ReservationNotificationService } from './reservation-notification.service';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReleaseReservationDto } from './release-reservation.dto';

const notice = { propertyId: 5, property: 'Casa Nicoya', ownerId: 1, tenantId: 2, reason: 'Cambio de planes' };

describe('Reservation notifications', () => {
  function setup(enabled = true) {
    const owner = { id: 1, name: 'Luis', surname1: 'Mora', email: 'owner@example.com', preferredLanguage: 'es', isActive: true };
    const tenant = { id: 2, name: 'Ana', surname1: 'Pérez', email: 'tenant@example.com', preferredLanguage: 'en', isActive: true };
    const findOneBy = jest.fn().mockImplementation(({ id }: { id: number }) => Promise.resolve(id === 1 ? owner : tenant));
    const sendNotification = jest.fn().mockResolvedValue(undefined);
    const service = new ReservationNotificationService(
      { getRepository: () => ({ findOneBy }) } as unknown as DataSource,
      { sendNotification } as unknown as BrevoMailService,
      { get: () => enabled ? 'true' : 'false' } as unknown as ConfigService,
    );
    return { service, findOneBy, sendNotification, owner, tenant };
  }

  it('notifies both parties in their preferred language', async () => {
    const test = setup();
    await test.service.notify('CONFIRMED', notice);
    expect(test.sendNotification).toHaveBeenCalledWith('owner@example.com', 'es', expect.objectContaining({ paragraphs: [expect.stringContaining('Ana Pérez')] }));
    expect(test.sendNotification).toHaveBeenCalledWith('tenant@example.com', 'en', expect.objectContaining({ paragraphs: [expect.stringContaining('Luis Mora')] }));
  });

  it('includes the reason when the reservation is removed', async () => {
    const test = setup();
    await test.service.notify('RELEASED', notice);
    expect(test.sendNotification).toHaveBeenCalledTimes(2);
    for (const call of test.sendNotification.mock.calls) expect(call[2].paragraphs.at(-1)).toContain(notice.reason);
  });

  it('does not send when notification emails are disabled', async () => {
    const test = setup(false);
    await test.service.notify('CONFIRMED', notice);
    expect(test.findOneBy).not.toHaveBeenCalled();
    expect(test.sendNotification).not.toHaveBeenCalled();
  });

  it('skips inactive recipients', async () => {
    const test = setup();
    test.tenant.isActive = false;
    await test.service.notify('CONFIRMED', notice);
    expect(test.sendNotification).toHaveBeenCalledTimes(1);
    expect(test.sendNotification.mock.calls[0][0]).toBe(test.owner.email);
  });

  it('isolates delivery failures so the other recipient still receives an email', async () => {
    const test = setup();
    test.sendNotification.mockRejectedValueOnce(new Error('Delivery failure'));
    await expect(test.service.notify('CONFIRMED', notice)).resolves.toBeUndefined();
    expect(test.sendNotification).toHaveBeenCalledTimes(2);
  });

  it('does not propagate database failures', async () => {
    const test = setup();
    test.findOneBy.mockRejectedValue(new Error('Database failure'));
    await expect(test.service.notify('RELEASED', notice)).resolves.toBeUndefined();
    expect(test.sendNotification).not.toHaveBeenCalled();
  });

  it.each(['es', 'en', 'fr', 'pt'])('builds complete reservation emails in %s', (language) => {
    for (const event of ['CONFIRMED', 'RELEASED'] as const) for (const role of ['owner', 'tenant'] as const) {
      const email = buildReservationEmail(event, { ...notice, person: 'Ana Pérez' }, language, role);
      const text = [email.subject, email.title, ...email.paragraphs, email.button.label, email.footer].join(' ');
      expect(text).not.toMatch(/{{|}}|undefined/);
      expect(text).toContain(notice.property);
      expect(text).toContain('Ana Pérez');
      if (event === 'RELEASED') expect(text).toContain(notice.reason);
      expect(email.button.path).toBe(role === 'owner' ? '/dashboard/owner/properties' : '/dashboard/reservations');
    }
  });

  it.each([undefined, null, 123, '', '   ', 'x'.repeat(501)])('rejects an invalid cancellation reason: %s', async (reason) => {
    expect(await validate(plainToInstance(ReleaseReservationDto, { reason }))).not.toHaveLength(0);
  });

  it('trims and validates the cancellation reason', async () => {
    const dto = plainToInstance(ReleaseReservationDto, { reason: '  Cambio de planes  ' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.reason).toBe('Cambio de planes');
  });
});
