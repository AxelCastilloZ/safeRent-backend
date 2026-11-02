import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Property } from '../property/entities/property.entity';
import { PropertyStatus } from '../property/property-status.enum';

@Injectable()
export class PropertyViewService {
  constructor(private readonly dataSource: DataSource) {}

  /** Solo se cuentan las vistas de propiedades publicadas: no existe para el público lo que no lo está. */
  private async assertPublished(propertyId: number) {
    const published = await this.dataSource.getRepository(Property).existsBy({ id: propertyId, status: PropertyStatus.ACTIVE });
    if (!published) throw new NotFoundException({ code: 'API_PROPIEDAD_NO_DISPONIBLE', message: 'Propiedad no disponible', params: {} });
  }

  private async count(propertyId: number) {
    const [row] = await this.dataSource.query<{ views: number }[]>(
      'SELECT count(*)::int AS views FROM property_view WHERE "propertyId" = $1',
      [propertyId],
    );
    return { propertyId, views: row.views };
  }

  /** Cuántas personas distintas han abierto la propiedad. */
  async views(propertyId: number) {
    await this.assertPublished(propertyId);
    return this.count(propertyId);
  }

  /** Registra que esta persona abrió la propiedad (una sola vez por persona) y devuelve el total. */
  async record(propertyId: number, visitorId: string) {
    await this.assertPublished(propertyId);
    await this.dataSource.query(
      `INSERT INTO property_view ("propertyId", "visitorId") VALUES ($1, $2)
       ON CONFLICT ("propertyId", "visitorId") DO UPDATE SET "lastViewedAt" = now()`,
      [propertyId, visitorId],
    );
    return this.count(propertyId);
  }
}
