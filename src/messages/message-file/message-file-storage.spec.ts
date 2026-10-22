import { MessageFileService } from './message-file.service';

describe('Private message files in Dropbox', () => {
  function fixture() {
    const repo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      findOneBy: jest.fn(),
    };
    const dropbox = {
      upload: jest
        .fn()
        .mockResolvedValue({ path: '/private/document.pdf', rev: 'r' }),
      delete: jest.fn(),
      temporaryLink: jest
        .fn()
        .mockResolvedValue('https://download.example.com/document'),
    };
    const service = new MessageFileService(
      repo as never,
      { findOne: async () => ({ id: 8 }) } as never,
      dropbox as never,
    );
    return { service, repo, dropbox };
  }
  it('uploads without creating a public shared link', async () => {
    const { service, dropbox } = fixture();
    const file = {
      originalname: 'document.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('pdf'),
      size: 3,
    } as Express.Multer.File;
    const rows = await service.uploadMany(8, [file], 'Ana');
    expect(dropbox.upload).toHaveBeenCalledWith(
      file,
      'Mensajes/8/Adjuntos',
      false,
    );
    expect(rows[0]).toMatchObject({
      storage: 'dropbox',
      path: '/private/document.pdf',
      uploadedBy: 'Ana',
    });
  });
  it('downloads through the backend and restricts lookup to the message', async () => {
    const { service, repo } = fixture();
    repo.findOneBy.mockResolvedValue({
      id: 2,
      storage: 'dropbox',
      path: '/private/document.pdf',
      mimeType: 'application/pdf',
      fileName: 'document.pdf',
    });
    const original = global.fetch;
    global.fetch = jest.fn().mockResolvedValue(new Response('pdf'));
    try {
      const download = await service.download(8, 2);
      expect(repo.findOneBy).toHaveBeenCalledWith({
        id: 2,
        message: { id: 8 },
      });
      expect(download.getHeaders().type).toBe('application/pdf');
      expect(download.getHeaders().disposition).toContain('attachment;');
    } finally {
      global.fetch = original;
    }
  });
});
