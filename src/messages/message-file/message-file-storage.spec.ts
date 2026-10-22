import { MessageFileService } from './message-file.service';
import * as fs from 'fs';

describe('Local message attachments', () => {
  function fixture() {
    const repo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      findOneBy: jest.fn(),
    };
    const service = new MessageFileService(
      repo as never,
      { findOne: async () => ({ id: 8 }) } as never,
    );
    return { repo, service };
  }
  afterEach(() => jest.restoreAllMocks());
  it('stores attachment metadata using the local upload path', async () => {
    const { service } = fixture();
    const file = {
      path: 'uploads/document.pdf',
      originalname: 'document.pdf',
      mimetype: 'application/pdf',
      size: 3,
    } as Express.Multer.File;
    expect(await service.uploadMany(8, [file], 'Ana')).toEqual([
      expect.objectContaining({
        path: 'uploads/document.pdf',
        storage: 'local',
        uploadedBy: 'Ana',
      }),
    ]);
  });
  it('restricts downloads to the requested message', async () => {
    const { service, repo } = fixture();
    repo.findOneBy.mockResolvedValue(null);
    await expect(service.download(8, 2)).rejects.toThrow(
      'Archivo no encontrado',
    );
    expect(repo.findOneBy).toHaveBeenCalledWith({ id: 2, message: { id: 8 } });
  });
  it('cleans up local files when metadata persistence fails', async () => {
    const { service, repo } = fixture();
    repo.save.mockRejectedValue(new Error('database'));
    const unlink = jest
      .spyOn(fs.promises, 'unlink')
      .mockResolvedValue(undefined);
    await expect(
      service.uploadMany(8, [
        { path: 'uploads/document.pdf' } as Express.Multer.File,
      ]),
    ).rejects.toThrow('database');
    expect(unlink).toHaveBeenCalledWith('uploads/document.pdf');
  });
});
