import { Matches } from 'class-validator';

export class RecordViewDto {
  /** Código anónimo que genera y guarda el navegador de quien mira (no es dato personal). */
  @Matches(/^[A-Za-z0-9_-]{16,64}$/)
  visitorId!: string;
}
