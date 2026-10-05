import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocationService } from './location.service';

describe('Location search', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  const service = new LocationService({ get: () => 'test-key' } as unknown as ConfigService);
  beforeEach(() => { global.fetch = fetchMock; fetchMock.mockReset(); });
  afterEach(() => { global.fetch = originalFetch; });

  it.each([
    ['Ciudad de Panamá, Panamá', 8.9824, -79.5199],
    ['Madrid, España', 40.4168, -3.7038],
    ['San José, Costa Rica', 9.935, -84.084],
  ])('searches worldwide and normalizes valid results for %s', async (address, latitude, longitude) => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ results: [
      { formatted: address, lat: latitude, lon: longitude, result_type: 'city' },
      { formatted: 'Invalid', lat: 100, lon: 0 },
    ] }) });
    await expect(service.search(address)).resolves.toEqual([
      { address, latitude, longitude, type: 'city' },
    ]);
    const url = fetchMock.mock.calls[0][0] as URL;
    expect(url.searchParams.get('text')).toBe(address);
    expect(url.searchParams.has('filter')).toBe(false);
  });

  it('returns an actionable error without calling the provider when no key exists', async () => {
    const unconfigured = new LocationService({ get: () => undefined } as unknown as ConfigService);
    await expect(unconfigured.search('San José')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('hides provider errors and credentials', async () => {
    fetchMock.mockRejectedValue(new Error('secret test-key'));
    await expect(service.search('San José')).rejects.toThrow('No pudimos buscar la dirección');
  });
});
