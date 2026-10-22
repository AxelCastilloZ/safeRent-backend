import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Property } from '../property/entities/property.entity';
import { PropertyStatus } from '../property/property-status.enum';
import { SavedProperty } from './entities/saved-property.entity';

@Injectable()
export class SavedPropertyService {
  constructor(
    @InjectRepository(SavedProperty)
    private readonly savedRepo: Repository<SavedProperty>,

    @InjectRepository(Property)
    private readonly propertyRepo: Repository<Property>,
  ) {}

  /** Ids de las propiedades guardadas, de la más reciente a la más antigua (para el corazón y el contador). */
  async listIds(userId: number): Promise<number[]> {
    const rows = await this.savedRepo
      .createQueryBuilder('saved')
      .innerJoin('saved.property', 'property')
      .select('property.id', 'propertyId')
      .where('saved.user = :userId', { userId })
      .orderBy('saved.createdAt', 'DESC')
      .addOrderBy('saved.id', 'DESC')
      .getRawMany<{ propertyId: number }>();

    return rows.map((row) => Number(row.propertyId));
  }

  /**
   * Guardadas con lo necesario para mostrar una tarjeta. Las propiedades que dejaron de estar activas se
   * devuelven igual, marcadas con `available: false`, para que el inquilino pueda verlas y quitarlas.
   */
  async list(userId: number) {
    const saved = await this.savedRepo.find({
      where: { user: { id: userId } },
      relations: { property: { files: true } },
      order: { createdAt: 'DESC', id: 'DESC' },
    });

    return saved.map(({ property, createdAt }) => ({
      id: property.id,
      title: property.title,
      description: property.description,
      address: property.address,
      cost: property.cost,
      typeOfCoin: property.typeOfCoin,
      rooms: property.rooms,
      guest: property.guest,
      status: property.status,
      typeOfProperty: property.typeOfProperty,
      services: property.services,
      files: (property.files ?? []).map(({ path, mimeType, url }) => ({ path, mimeType, url })),
      owner: { id: property.owner.id, name: property.owner.name },
      // Solo si está reservada, no a nombre de quién.
      reserved: Boolean(property.reservedTenantId),
      available: property.status === PropertyStatus.ACTIVE,
      savedAt: createdAt,
    }));
  }

  /** Guarda una propiedad activa que no sea del propio usuario. Idempotente: guardar dos veces no duplica. */
  async save(userId: number, propertyId: number) {
    const property = await this.propertyRepo.findOneBy({ id: propertyId });
    if (!property || property.status !== PropertyStatus.ACTIVE) throw new NotFoundException('Propiedad no disponible');
    if (property.ownerId === userId) throw new BadRequestException('No puedes guardar tu propia propiedad');

    await this.insertIgnoringDuplicates(userId, [propertyId]);
    return { propertyId, saved: true };
  }

  /** Quita una propiedad de las guardadas. Idempotente: si ya no estaba, no falla. */
  async remove(userId: number, propertyId: number) {
    const result = await this.savedRepo
      .createQueryBuilder()
      .delete()
      .from(SavedProperty)
      .where('"userId" = :userId', { userId })
      .andWhere('"propertyId" = :propertyId', { propertyId })
      .execute();

    return { propertyId, removed: (result.affected ?? 0) > 0 };
  }

  /**
   * Importación de una sola vez de lo que el inquilino tenía guardado en su navegador. Se ignoran las
   * propiedades que no existen, ya no están activas o son suyas, y las que ya estaban guardadas.
   */
  async importMany(userId: number, propertyIds: number[]) {
    const unique = [...new Set(propertyIds)];
    if (unique.length === 0) return { saved: 0, skipped: 0 };

    const properties = await this.propertyRepo.find({ where: { id: In(unique), status: PropertyStatus.ACTIVE } });
    const importable = properties.filter((property) => property.ownerId !== userId).map((property) => property.id);

    await this.insertIgnoringDuplicates(userId, importable);
    return { saved: importable.length, skipped: unique.length - importable.length };
  }

  private async insertIgnoringDuplicates(userId: number, propertyIds: number[]) {
    if (propertyIds.length === 0) return;

    await this.savedRepo
      .createQueryBuilder()
      .insert()
      .into(SavedProperty)
      .values(propertyIds.map((propertyId) => ({ user: { id: userId }, property: { id: propertyId } })))
      .orIgnore()
      .execute();
  }
}
