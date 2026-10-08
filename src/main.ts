import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { DataSource, In } from 'typeorm';
import { PropertyFile } from './property/entities/property-file.entity';
import type { Request, Response, NextFunction } from 'express';
import { join } from 'path';
import * as dns from 'dns';

// Force IPv4 first — Supabase resolves to IPv6 by default
dns.setDefaultResultOrder('ipv4first');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableShutdownHooks();

  // Only property photos are public. Message attachments require their protected endpoint.
  app.use('/uploads', (req: Request, res: Response, next: NextFunction) => {
    let name: string;
    try { name = decodeURIComponent(req.path.slice(1)); }
    catch { res.sendStatus(404); return; }
    if (!name || (name.includes('/') || name.includes(String.fromCharCode(92))) || name.includes('..')) { res.sendStatus(404); return; }
    void app.get(DataSource).getRepository(PropertyFile).findOneBy({ path: In([`uploads/${name}`, `uploads${String.fromCharCode(92)}${name}`]) })
      .then((file) => { if (file) next(); else res.sendStatus(404); })
      .catch(() => res.sendStatus(500));
  });
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  app.enableCors();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
