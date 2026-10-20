import { Module } from '@nestjs/common';
import { CurrencyApiClient } from './currency-api.client';
import { CurrencyController } from './currency.controller';
import { CurrencyRepository } from './currency.repository';
import { CurrencySyncService } from './currency-sync.service';
import { ScheduleModule } from '@nestjs/schedule';
import { CurrencySchedulerService } from './currency-scheduler.service';
import { CurrencyService } from './currency.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [CurrencyController],
  providers: [
    CurrencyRepository,
    CurrencyApiClient,
    CurrencySyncService,
    CurrencySchedulerService,
    CurrencyService,
  ],
  exports: [CurrencySyncService, CurrencyService, CurrencyRepository],
})
export class CurrencyModule {}
