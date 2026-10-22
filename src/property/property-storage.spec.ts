import { PropertyService } from './property.service';

describe('Property cloud files', () => {
  const file = {
    originalname: 'casa.jpg',
    mimetype: 'image/jpeg',
    size: 42,
    buffer: Buffer.from('photo'),
  } as Express.Multer.File;
  function fixture(title = 'Casa en San José') {
    const repo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      findOne: jest.fn(),
      remove: jest.fn(),
    };
    const dropbox = {
      upload: jest
        .fn()
        .mockResolvedValue({
          path: '/saferent/photo.jpg',
          url: 'https://example.com/photo',
          rev: 'revision',
        }),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const service = new PropertyService(
      { findOne: async () => ({ id: 5, title, owner: { name: 'Ana' } }) } as never,
      {} as never,
      {} as never,
      repo as never,
      {} as never,
      {} as never,
      {} as never,
      dropbox as never,
    );
    return { service, repo, dropbox };
  }
  it('persists Dropbox metadata and leaves the original filename for display', async () => {
    const { service, dropbox } = fixture();
    expect(await service.saveFiles(5, [file])).toEqual([
      expect.objectContaining({
        storage: 'dropbox',
        path: '/saferent/photo.jpg',
        fileName: 'casa.jpg',
        rev: 'revision',
      }),
    ]);
    expect(dropbox.upload).toHaveBeenCalledWith(file, 'Propiedades/casa-en-san-jose-5/Fotos');
  });
  it.each([
    ['../Casa / Playa', 'casa-playa'],
    ['   ', 'propiedad'],
    ['Ático Ñandú', 'atico-nandu'],
  ])('uses a safe property name for %j', async (title, folder) => {
    const { service, dropbox } = fixture(title);
    await service.saveFiles(5, [file]);
    expect(dropbox.upload).toHaveBeenCalledWith(file, `Propiedades/${folder}-5/Fotos`);
  });
  it('removes uploaded files when saving metadata fails', async () => {
    const { service, repo, dropbox } = fixture();
    repo.save.mockRejectedValue(new Error('database'));
    await expect(service.saveFiles(5, [file])).rejects.toThrow('database');
    expect(dropbox.delete).toHaveBeenCalledWith('/saferent/photo.jpg');
  });
  it('keeps metadata if Dropbox refuses deletion', async () => {
    const { service, repo, dropbox } = fixture();
    repo.findOne.mockResolvedValue({
      id: 7,
      storage: 'dropbox',
      path: '/saferent/photo.jpg',
    });
    dropbox.delete.mockRejectedValue(new Error('offline'));
    await expect(service.removeFile(5, 7)).rejects.toThrow('offline');
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { id: 7, property: { id: 5 } },
    });
    expect(repo.remove).not.toHaveBeenCalled();
  });
  it('rejects empty uploads', async () => {
    const { service, dropbox } = fixture();
    await expect(service.saveFiles(5, [])).rejects.toThrow('archivos');
    expect(dropbox.upload).not.toHaveBeenCalled();
  });
});
