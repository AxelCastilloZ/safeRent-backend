import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { User } from '../src/user/entities/user.entity';
import type { Server } from 'node:http';

void ConfigModule.forRoot();
async function main() {
  const source = new DataSource({
    type: 'postgres', host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
    username: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE,
    entities: [__dirname + '/../src/**/*.entity.ts'], synchronize: false,
  });
  await source.initialize();
  try {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDataSourceToken()).useValue(source).compile();
    const app = module.createNestApplication();
    await app.init();
    try {
      const server = app.getHttpServer() as Server;
      await request(server).get('/properties').expect(200);
      await request(server).get('/properties/active/3').expect(401);
      await request(server).get('/roles').expect(401);
      await request(server).get('/comments/admin').expect(401);
      const users = await source.getRepository(User).find({ where: { isActive: true }, relations: { Roles: true } });
      for (const user of users) {
        const token = await app.get(JwtService).signAsync({ sub: user.id });
        const admin = user.Roles.some((role) => role.isActive && role.name === 'ADMIN');
        await request(server).get('/comments/admin').auth(token, { type: 'bearer' }).expect(admin ? 200 : 403);
        await request(server).get('/users').auth(token, { type: 'bearer' }).expect(admin ? 200 : 403);
      }
      console.log('Arranque de todos los módulos y permisos con JWT/cuentas reales verificados. No se modificaron datos.');
    } finally { await app.close(); }
  } finally { if (source.isInitialized) await source.destroy(); }
}
void main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
