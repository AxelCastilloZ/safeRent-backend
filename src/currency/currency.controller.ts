import { Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { AppRole, Roles } from '../auth/access';
import { CurrencySyncService } from './currency-sync.service';
import { CurrencyService } from './currency.service';
import { ConvertCurrencyDto } from './dto/convert-currency.dto';

@Roles(AppRole.ADMIN)
@Controller('currency')
export class CurrencyController {
  constructor(
    private readonly synchronization: CurrencySyncService,
    private readonly conversions: CurrencyService,
  ) {}

  @Get('convert')
  @Roles(AppRole.ADMIN, AppRole.CLIENT, AppRole.OWNER)
  convert(@Query() query: ConvertCurrencyDto) {
    return this.conversions.convert(query);
  }

  @Get('status')
  getStatus() {
    return this.synchronization.getStatus();
  }

  @Post('sync')
  @HttpCode(200)
  synchronize() {
    return this.synchronization.synchronize();
  }
}
