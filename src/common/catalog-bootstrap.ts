import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { seedCatalogCodes } from './catalog-seeds';

@Injectable()
export class CatalogBootstrap implements OnModuleInit {
  constructor(private readonly db: DataSource) {}
  async onModuleInit() {
    // With production migrations disabled, synchronization creates columns but cannot migrate data.
    if (process.env.DB_SYNCHRONIZE !== 'false') await seedCatalogCodes(this.db);
  }
}
