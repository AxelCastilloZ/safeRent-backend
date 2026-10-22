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

  it('reuses the access token and never shares private attachments', async () => {
    await service.upload(file, 'Mensajes/1/Adjuntos', false);
    await service.upload(file, 'Mensajes/2/Adjuntos', false);
    expect(
      mock.mock.calls.filter(([url]) => String(url).endsWith('/oauth2/token')),
    ).toHaveLength(1);
    expect(
      mock.mock.calls.some(([url]) => String(url).includes('/sharing/')),
    ).toBe(false);
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
      service.upload(file, 'Usuarios/1/Perfil'),
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
    await expect(service.upload(file, 'Usuarios/1/Perfil')).rejects.toThrow(
      'carpeta',
    );
  });

  it('fails without credentials before sending file contents', async () => {
    service = new DropboxService(new ConfigService({}));
    await expect(service.upload(file, 'Usuarios/1/Perfil')).rejects.toThrow(
      'El almacenamiento Dropbox aún no está configurado.',
    );
    expect(mock).not.toHaveBeenCalled();
  });

  it('preserves authentication errors instead of masking them as network failures', async () => {
    mock.mockResolvedValue(Response.json({ error: 'invalid_grant' }, { status: 400 }));
    await expect(service.upload(file, 'Usuarios/1/Perfil')).rejects.toThrow(
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
    await expect(service.upload(file, 'Usuarios/1/Perfil')).rejects.toThrow(
      'Dropbox no está disponible. Intenta nuevamente.',
    );
  });
});
