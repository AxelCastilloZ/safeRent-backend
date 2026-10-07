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
      migrations: [PasswordRecovery1791244800000],
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
