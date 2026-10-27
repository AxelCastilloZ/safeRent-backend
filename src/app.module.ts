import { DropboxStorage1792627200000 } from './migrations/1792627200000-dropbox-storage';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { UserModule } from './user/user.module';
import { RoleModule } from './role/role.module';
import { PropertyModule } from './property/property.module';
import { ServiceModule } from './service/service.module';
import { MessagesModule } from './messages/messages.module';
import { CommentModule } from './comment/comment.module';
import { ReservationModule } from './reservation/reservation.module';
import { AuthModule } from './auth/auth.module';
import { PasswordRecovery1791244800000 } from './migrations/1791244800000-password-recovery';
import { SavedProperty1792540800000 } from './migrations/1792540800000-saved-property';
import { SavedPropertyModule } from './saved-property/saved-property.module';
import { MessageReadAt1791417600000 } from './migrations/1791417600000-message-read-at';
import { CurrencyRates1792454400000 } from './migrations/1792454400000-currency-rates';
import { CurrencyModule } from './currency/currency.module';
import { CurrencyProviderCodes1792454400001 } from './migrations/1792454400001-currency-provider-codes';
import { ProfileCurrency1792454400002 } from './migrations/1792454400002-profile-currency';
import { ProfileLanguage1792627200000 } from './migrations/1792627200000-profile-language';
import { CatalogI18n1792713600000 } from './migrations/1792713600000-catalog-i18n';
import { Visits1792800000000 } from './migrations/1792800000000-visits';
import { VisitNotifications1792886400000 } from './migrations/1792886400000-visit-notifications';
import { VisitAutomation1792972800000 } from './migrations/1792972800000-visit-automation';
import { VisitModule } from './visit/visit.module';
import { CatalogBootstrap } from './common/catalog-bootstrap';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      autoLoadEntities: true,
      synchronize: process.env.DB_SYNCHRONIZE !== 'false',
      migrations: [
        PasswordRecovery1791244800000,
        MessageReadAt1791417600000,
        CurrencyRates1792454400000,
        CurrencyProviderCodes1792454400001,
        ProfileCurrency1792454400002,
        SavedProperty1792540800000,
        DropboxStorage1792627200000,
        ProfileLanguage1792627200000,
        CatalogI18n1792713600000,
        Visits1792800000000,
        VisitNotifications1792886400000,
        VisitAutomation1792972800000,
      ],
      // Development already synchronizes entities; production applies versioned migrations.
      migrationsRun: process.env.DB_SYNCHRONIZE === 'false',
    }),

    UserModule,
    RoleModule,
    PropertyModule,
    ServiceModule,
    MessagesModule,
    AuthModule,
    ReservationModule,
    CommentModule,
    CurrencyModule,
    SavedPropertyModule,
    VisitModule,
  ],
  controllers: [AppController],
  providers: [AppService, CatalogBootstrap],
})
export class AppModule {}
