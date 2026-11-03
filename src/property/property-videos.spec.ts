import { MAX_VIDEOS, PropertyService } from './property.service';

describe('Property videos', () => {
  const video = { originalname: 'recorrido.mp4', mimetype: 'video/mp4', size: 1024, buffer: Buffer.from('video') } as Express.Multer.File;

  function fixture(existingVideos = 0) {
    const repo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      count: jest.fn().mockResolvedValue(existingVideos),
    };
    const dropbox = {
      upload: jest.fn().mockResolvedValue({ path: '/saferent/recorrido.mp4', url: 'https://example.com/video', rev: 'revision' }),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const service = new PropertyService(
      { findOne: async () => ({ id: 5, title: 'Casa en San José', owner: { name: 'Ana' } }) } as never,
      {} as never, {} as never, repo as never, {} as never, {} as never, {} as never, dropbox as never,
    );
    return { service, repo, dropbox };
  }

  it('stores videos in their own folder keeping the video type', async () => {
    const { service, dropbox } = fixture();
    expect(await service.saveVideos(5, [video])).toEqual([
      expect.objectContaining({ storage: 'dropbox', fileName: 'recorrido.mp4', mimeType: 'video/mp4', path: '/saferent/recorrido.mp4' }),
    ]);
    expect(dropbox.upload).toHaveBeenCalledWith(video, 'Propiedades/casa-en-san-jose-5/Videos');
  });

  it('refuses more videos than the limit, counting the ones already saved', async () => {
    const { service, dropbox } = fixture(MAX_VIDEOS);
    await expect(service.saveVideos(5, [video])).rejects.toMatchObject({ response: { code: 'API_MAXIMO_VIDEOS_POR_PROPIEDAD' } });
    expect(dropbox.upload).not.toHaveBeenCalled();
  });

  it('allows filling the remaining slots', async () => {
    const { service } = fixture(MAX_VIDEOS - 1);
    await expect(service.saveVideos(5, [video])).resolves.toHaveLength(1);
  });

  it('removes uploaded videos when saving metadata fails', async () => {
    const { service, repo, dropbox } = fixture();
    repo.save.mockRejectedValue(new Error('database'));
    await expect(service.saveVideos(5, [video])).rejects.toThrow('database');
    expect(dropbox.delete).toHaveBeenCalledWith('/saferent/recorrido.mp4');
  });

  it('rejects empty uploads', async () => {
    const { service, dropbox } = fixture();
    await expect(service.saveVideos(5, [])).rejects.toThrow('archivos');
    expect(dropbox.upload).not.toHaveBeenCalled();
  });
});
