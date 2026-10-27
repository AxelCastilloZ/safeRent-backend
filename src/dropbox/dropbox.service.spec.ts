import { ConfigService } from '@nestjs/config';
import { DropboxService } from './dropbox.service';

describe('Dropbox storage', () => {
  const originalFetch = global.fetch;
  const file = {
    buffer: Buffer.from('photo'),
    mimetype: 'image/jpeg',
  } as Express.Multer.File;
  let mock: jest.Mock;
  let service: DropboxService;
  beforeEach(() => {
    service = new DropboxService(
      new ConfigService({
        DROPBOX_APP_KEY: 'key',
        DROPBOX_APP_SECRET: 'secret',
        DROPBOX_REFRESH_TOKEN: 'refresh',
      }),
    );
    mock = jest.fn(async (url: string) => {
      if (url.endsWith('/oauth2/token'))
        return Response.json({ access_token: 'access', expires_in: 14400 });
      if (url.endsWith('/files/upload'))
        return Response.json({
          path_lower: '/saferent/propiedades/1/fotos/photo.jpg',
          rev: 'rev',
        });
      if (url.endsWith('/sharing/create_shared_link_with_settings'))
        return Response.json({
          url: 'https://www.dropbox.com/scl/fi/test/photo.jpg?rlkey=key&dl=0',
        });
      return Response.json({});
    });
    global.fetch = mock as typeof fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('uploads bytes with a generated path and saves a direct shared URL', async () => {
    const stored = await service.upload(file, 'Propiedades/1/Fotos');
    expect(stored.url).toContain('raw=1');
    expect(stored.url).toContain('rlkey=key');
    const call = mock.mock.calls.find(([url]) =>
      String(url).endsWith('/files/upload'),
    )!;
    const options = call[1] as RequestInit;
    expect(
      JSON.parse((options.headers as Record<string, string>)['Dropbox-API-Arg'])
        .path,
    ).toMatch(/^\/SafeRent\/Propiedades\/1\/Fotos\/[\w-]+\.jpg$/);
    expect(Buffer.from(options.body as Uint8Array)).toEqual(file.buffer);
  });

  it('reuses the access token for property uploads', async () => {
    await service.upload(file, 'Propiedades/1/Fotos');
    await service.upload(file, 'Propiedades/2/Fotos');
    expect(
      mock.mock.calls.filter(([url]) => String(url).endsWith('/oauth2/token')),
    ).toHaveLength(1);
  });
  it('recovers an existing link without creating another shared link', async () => {
    const normal = mock.getMockImplementation()!;
    mock.mockImplementation((url: string) =>
      url.endsWith('/sharing/list_shared_links')
        ? Promise.resolve(
            Response.json({
              links: [{ url: 'https://www.dropbox.com/photo.jpg?dl=0' }],
            }),
          )
        : normal(url),
    );
    await expect(
      service.existingSharedLink('/saferent/photo.jpg'),
    ).resolves.toBe('https://www.dropbox.com/photo.jpg?raw=1');
    expect(
      mock.mock.calls.some(([url]) =>
        String(url).endsWith('/sharing/create_shared_link_with_settings'),
      ),
    ).toBe(false);
  });
  it('reuses a shared link when Dropbox reports a conflict', async () => {
    const normal = mock.getMockImplementation()!;
    mock.mockImplementation((url: string) =>
      url.endsWith('/sharing/create_shared_link_with_settings')
        ? Promise.resolve(
            Response.json(
              {
                error: {
                  '.tag': 'shared_link_already_exists',
                  shared_link_already_exists: {
                    metadata: { url: 'https://www.dropbox.com/photo.jpg?dl=0' },
                  },
                },
              },
              { status: 409 },
            ),
          )
        : normal(url),
    );
    await expect(service.sharedLink('/saferent/photo.jpg')).resolves.toBe(
      'https://www.dropbox.com/photo.jpg?raw=1',
    );
  });

  it('cleans up an upload when shared-link creation fails', async () => {
    const normal = mock.getMockImplementation()!;
    mock.mockImplementation((url: string) =>
      url.includes('/sharing/')
        ? Promise.resolve(Response.json({}, { status: 403 }))
        : normal(url),
    );
    await expect(service.upload(file, 'Propiedades/1/Fotos')).rejects.toThrow(
      'Dropbox',
    );
    expect(
      mock.mock.calls.some(([url]) => String(url).endsWith('/files/delete_v2')),
    ).toBe(true);
  });

  it('accepts existing folders but rejects file conflicts', async () => {
    const normal = mock.getMockImplementation()!;
    mock.mockImplementation((url: string) =>
      url.endsWith('create_folder_v2')
        ? Promise.resolve(
            Response.json(
              { error_summary: 'path/conflict/folder/' },
              { status: 409 },
            ),
          )
        : normal(url),
    );
    await expect(
      service.upload(file, 'Propiedades/1/Fotos'),
    ).resolves.toHaveProperty('rev');
    mock.mockImplementation((url: string) =>
      url.endsWith('create_folder_v2')
        ? Promise.resolve(
            Response.json(
              { error_summary: 'path/conflict/file/' },
              { status: 409 },
            ),
          )
        : normal(url),
    );
    await expect(service.upload(file, 'Propiedades/1/Fotos')).rejects.toThrow(
      'carpeta',
    );
  });

  it('fails without credentials before sending file contents', async () => {
    service = new DropboxService(new ConfigService({}));
    await expect(service.upload(file, 'Propiedades/1/Fotos')).rejects.toThrow(
      'El almacenamiento Dropbox aún no está configurado.',
    );
    expect(mock).not.toHaveBeenCalled();
  });

  it('preserves authentication errors instead of masking them as network failures', async () => {
    mock.mockResolvedValue(
      Response.json({ error: 'invalid_grant' }, { status: 400 }),
    );
    await expect(service.upload(file, 'Propiedades/1/Fotos')).rejects.toThrow(
      'No se pudo conectar con Dropbox. Intenta nuevamente.',
    );
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('reports connection failures separately after authenticating', async () => {
    mock.mockImplementation(async (url: string) => {
      if (url.endsWith('/oauth2/token')) {
        return Response.json({ access_token: 'access', expires_in: 14400 });
      }
      throw new TypeError('fetch failed');
    });
    await expect(service.upload(file, 'Propiedades/1/Fotos')).rejects.toThrow(
      'Dropbox no está disponible. Intenta nuevamente.',
    );
  });
});
