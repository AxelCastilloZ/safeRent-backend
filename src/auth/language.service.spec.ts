import type { DataSource } from 'typeorm';
import { ProfileService } from './profile.service';
import { User } from '../user/entities/user.entity';
import type { SupportedLanguage } from './dto/language.dto';

describe('Account language preference', () => {
  function fixture(affected = 1) {
    const update = jest.fn().mockResolvedValue({ affected });
    const getRepository = jest.fn().mockReturnValue({ update });
    const service = new ProfileService({ getRepository } as unknown as DataSource);
    return { service, update, getRepository };
  }

  it('updates only the language of an active account', async () => {
    const { service, update, getRepository } = fixture();
    expect(await service.updateLanguage(7, 'fr')).toEqual({ preferredLanguage: 'fr' });
    expect(getRepository).toHaveBeenCalledWith(User);
    expect(update).toHaveBeenCalledWith({ id: 7, isActive: true }, { preferredLanguage: 'fr' });
  });

  it('rejects unsupported values even when called without an HTTP validation pipe', async () => {
    const { service, update } = fixture();
    await expect(service.updateLanguage(7, 'de' as SupportedLanguage)).rejects.toMatchObject({ status: 400 });
    expect(update).not.toHaveBeenCalled();
  });

  it('does not report success for a missing or inactive account', async () => {
    const { service } = fixture(0);
    await expect(service.updateLanguage(7, 'pt')).rejects.toMatchObject({ status: 404 });
  });
});
