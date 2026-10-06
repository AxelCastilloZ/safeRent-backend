import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager, IsNull, LessThan, MoreThan } from 'typeorm';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { User } from '../user/entities/user.entity';
import {
  BrevoDeliveryError,
  BrevoMailService,
} from '../mail/brevo-mail.service';
import {
  PasswordRecoveryJob,
  PasswordResetToken,
} from './entities/password-reset-token.entity';
import { ResetPasswordDto } from './dto/reset-password.dto';

export const RECOVERY_MESSAGE =
  'Si los datos corresponden a una cuenta activa, recibirás un enlace para cambiar tu contraseña.';
const INVALID_LINK = 'El enlace es inválido o ha expirado. Solicita uno nuevo.';

@Injectable()
export class PasswordRecoveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PasswordRecoveryService.name);
  private readonly encryptionKey: Buffer;
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private lastCleanup = 0;

  constructor(
    private readonly db: DataSource,
    config: ConfigService,
    private readonly mail: BrevoMailService,
  ) {
    const key = config.getOrThrow<string>('PASSWORD_RECOVERY_ENCRYPTION_KEY');
    if (!/^[a-fA-F0-9]{64}$/.test(key))
      throw new Error(
        'PASSWORD_RECOVERY_ENCRYPTION_KEY debe ser una clave hexadecimal de 32 bytes.',
      );
    this.encryptionKey = Buffer.from(key, 'hex');
  }

  onModuleInit() {
    this.timer = setInterval(() => {
      if (!this.running)
        this.running = this.processQueue()
          .catch(() => {
            this.logger.error('No se pudo procesar la cola de recuperación.');
          })
          .finally(() => {
            this.running = undefined;
          });
    }, 1000);
    this.timer.unref();
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }

  private encrypt(identifier: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const data = Buffer.concat([
      cipher.update(identifier, 'utf8'),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
  }
  private decrypt(payload: string) {
    const data = Buffer.from(payload, 'base64');
    const cipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      data.subarray(0, 12),
    );
    cipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([
      cipher.update(data.subarray(28)),
      cipher.final(),
    ]).toString('utf8');
  }

  private async limit(
    manager: EntityManager,
    scope: string,
    value: string,
    maximum: number,
  ) {
    const key = createHmac('sha256', this.encryptionKey)
      .update(`${scope}:${value}`)
      .digest('hex');
    const rows: { count: number }[] = await manager.query(
      `
      INSERT INTO password_recovery_limits ("key", "count", "expiresAt") VALUES ($1, 1, now() + interval '15 minutes')
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN password_recovery_limits."expiresAt" <= now() THEN 1 ELSE password_recovery_limits."count" + 1 END,
        "expiresAt" = CASE WHEN password_recovery_limits."expiresAt" <= now() THEN now() + interval '15 minutes' ELSE password_recovery_limits."expiresAt" END
      RETURNING "count"`,
      [key],
    );
    return rows[0].count <= maximum;
  }

  async request(identifier: string, ip: string) {
    const accepted = await this.db.transaction(async (manager) => {
      const ipAllowed = await this.limit(manager, 'forgot-ip', ip, 10);
      if (!ipAllowed) return false;
      const idAllowed = await this.limit(
        manager,
        'forgot-id',
        identifier.includes('@') ? identifier.toLowerCase() : identifier,
        3,
      );
      if (!idAllowed) return false;
      await manager.save(PasswordRecoveryJob, {
        payload: this.encrypt(identifier),
        availableAt: new Date(),
      });
      return true;
    });
    if (!accepted)
      throw new HttpException(
        'Demasiadas solicitudes. Intenta nuevamente en 15 minutos.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    return { message: RECOVERY_MESSAGE };
  }

  async reset(dto: ResetPasswordDto, ip: string) {
    const allowed = await this.db.transaction((manager) =>
      this.limit(manager, 'reset-ip', ip, 20),
    );
    if (!allowed)
      throw new HttpException(
        'Demasiados intentos. Intenta nuevamente en 15 minutos.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    await this.db.transaction(async (manager) => {
      const reference = await manager.findOneBy(PasswordResetToken, {
        tokenHash,
      });
      if (!reference) throw new BadRequestException(INVALID_LINK);
      // Always lock user before token: serializes resets and issuance for the same account.
      const user = await manager.findOne(User, {
        select: { id: true, isActive: true, sessionVersion: true },
        where: { id: reference.userId },
        lock: { mode: 'pessimistic_write' },
      });
      const token = await manager.findOne(PasswordResetToken, {
        where: { id: reference.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !user?.isActive ||
        !token ||
        token.usedAt ||
        token.expiresAt.getTime() <= Date.now()
      )
        throw new BadRequestException(INVALID_LINK);
      const password = await bcrypt.hash(dto.password, 10);
      await manager.update(User, user.id, {
        password,
        sessionVersion: user.sessionVersion + 1,
      });
      await manager.update(
        PasswordResetToken,
        { userId: user.id, usedAt: IsNull() },
        { usedAt: new Date() },
      );
      // Older queued requests are rejected by createdAt/passwordChangedAt below.
      await manager.update(User, user.id, { passwordChangedAt: new Date() });
    });
    return { message: 'Contraseña actualizada correctamente.' };
  }

  async processQueue() {
    await this.db.transaction(async (manager) => {
      const jobs = manager.getRepository(PasswordRecoveryJob);
      const job = await jobs
        .createQueryBuilder('job')
        .where('job.availableAt <= :now', { now: new Date() })
        .orderBy('job.id', 'ASC')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getOne();
      if (!job) return;
      try {
        let identifier: string;
        try {
          identifier = this.decrypt(job.payload);
        } catch {
          this.logger.error(
            'Trabajo de recuperación no descifrable; revisa la clave de cifrado.',
          );
          await jobs.delete(job.id);
          return;
        }
        const query = manager
          .getRepository(User)
          .createQueryBuilder('user')
          .addSelect('user.passwordChangedAt')
          .where('user.isActive = true');
        if (identifier.includes('@'))
          query.andWhere('LOWER(user.email) = LOWER(:identifier)', {
            identifier,
          });
        else query.andWhere('user.idCard = :identifier', { identifier });
        const user = await query.setLock('pessimistic_write').getOne();
        if (
          !user ||
          (user.passwordChangedAt && user.passwordChangedAt >= job.createdAt)
        ) {
          await jobs.delete(job.id);
          return;
        }
        const tokens = manager.getRepository(PasswordResetToken);
        // Bound active links even when requests use different identifiers for the same account.
        const active = await tokens.countBy({
          userId: user.id,
          usedAt: IsNull(),
          expiresAt: MoreThan(new Date()),
        });
        if (active >= 3) {
          await jobs.delete(job.id);
          return;
        }
        const token = randomBytes(32).toString('base64url');
        // Email is submitted before persisting its hash; errors cannot leave a usable unsent token.
        await this.mail.sendPasswordReset(user.email, token);
        await tokens.save({
          userId: user.id,
          tokenHash: createHash('sha256').update(token).digest('hex'),
          expiresAt: new Date(Date.now() + this.mail.ttlMinutes * 60000),
        });
        await jobs.delete(job.id);
      } catch (error) {
        if (!(error instanceof BrevoDeliveryError)) throw error;
        this.logger.warn(
          `Fallo de Brevo al enviar recuperación (HTTP ${error.status ?? 'timeout/red'}).`,
        );
        if (!error.retryable || job.attempts >= 2) await jobs.delete(job.id);
        else
          await jobs.update(job.id, {
            attempts: job.attempts + 1,
            availableAt: new Date(Date.now() + 30000 * 2 ** job.attempts),
          });
      }
    });
    if (Date.now() - this.lastCleanup > 3600000) {
      await this.db
        .getRepository(PasswordResetToken)
        .delete({ expiresAt: LessThan(new Date()) });
      await this.db.query(
        'DELETE FROM password_recovery_limits WHERE "expiresAt" < now()',
      );
      await this.db
        .getRepository(PasswordRecoveryJob)
        .delete({ createdAt: LessThan(new Date(Date.now() - 3600000)) });
      this.lastCleanup = Date.now();
    }
  }
}
