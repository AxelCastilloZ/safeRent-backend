import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { UserModule } from '../user/user.module';
import { RoleModule } from '../role/role.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { ResourceAccessGuard } from './guard/resource-access.guard';
import { RolesGuard } from './guard/roles.guard';
import { JwtAuthGuard } from './guard/jwt-auth.guard';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailModule } from '../mail/mail.module';
import { PasswordRecoveryService } from './password-recovery.service';
import { ProfileService } from './profile.service';
import { PasswordRecoveryJob, PasswordRecoveryLimit, PasswordResetToken } from './entities/password-reset-token.entity';

@Module({
  imports: [
    MailModule,
    TypeOrmModule.forFeature([PasswordResetToken, PasswordRecoveryJob, PasswordRecoveryLimit]),
    UserModule,
    RoleModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: '120m',
          algorithm: 'HS256',
        },
        verifyOptions: {
          algorithms: ['HS256'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordRecoveryService,
    ProfileService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ResourceAccessGuard },
  ],
})
export class AuthModule {}
