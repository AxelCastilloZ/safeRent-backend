import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { PropertyService } from './property.service';
import { Property } from './entities/property.entity';
import { TypeOfProperty } from './entities/type-of-property.entity';
import { PropertyFile } from './entities/property-file.entity';
import { IconDescription } from './entities/icon-description.entity';
import { User } from '../user/entities/user.entity';
import { ServiceService } from '../service/service.service';
import { UserService } from '../user/user.service';
import { PropertyStatus } from './property-status.enum';

describe('Public property details', () => {
  const findOne = jest.fn();
  const service = new PropertyService(
    { findOne } as unknown as Repository<Property>,
    {} as Repository<TypeOfProperty>, {} as ServiceService,
    {} as Repository<PropertyFile>, {} as Repository<IconDescription>,
    {} as Repository<User>,
    { ensureRole: jest.fn() } as unknown as UserService,
  );
  it('only queries published properties and exposes the public owner fields', async () => {
    findOne.mockResolvedValue({
      id: 9, title: 'Casa', owner: { id: 2, name: 'Ana', email: 'private', idCard: 'private' },
      files: [{ path: 'uploads/photo.jpg', mimeType: 'image/jpeg', uploadedBy: 'private' }],
      services: [],
    });
    const result = await service.findPublic(9);
    expect(findOne).toHaveBeenCalledWith({
      where: { id: 9, status: PropertyStatus.ACTIVE },
      relations: { files: true, iconDescriptions: true },
    });
    expect(result.owner).toEqual({ id: 2, name: 'Ana' });
    expect(result.files).toEqual([{ path: 'uploads/photo.jpg', mimeType: 'image/jpeg' }]);
  });
  it('returns not found for an unpublished or missing property', async () => {
    findOne.mockResolvedValue(null);
    await expect(service.findPublic(9)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('preserves the Dropbox URL in public photos without exposing private metadata', async () => {
    const url = 'https://www.dropbox.com/scl/fi/test/photo.jpg?raw=1';
    findOne.mockResolvedValue({ id: 9, owner: { id: 2, name: 'Ana' }, files: [{ path: '/saferent/propiedades/casa-9/fotos/photo.jpg', mimeType: 'image/jpeg', url, uploadedBy: 'private' }] });
    const result = await service.findPublic(9);
    expect(result.files).toEqual([{ path: '/saferent/propiedades/casa-9/fotos/photo.jpg', mimeType: 'image/jpeg', url }]);
  });
});
