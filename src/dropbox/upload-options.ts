import { BadRequestException } from '@nestjs/common';
import { memoryStorage } from 'multer';

export function uploadOptions(mimeTypes: string[], megabytes = 10) {
  return {
    storage: memoryStorage(),
    limits: { fileSize: megabytes * 1024 * 1024, files: 10, fields: 5 },
    fileFilter: (
      _req: unknown,
      file: Express.Multer.File,
      cb: (error: Error | null, accept: boolean) => void,
    ) => {
      if (mimeTypes.includes(file.mimetype)) cb(null, true);
      else
        cb(new BadRequestException('Formato de archivo no permitido.'), false);
    },
  };
}
