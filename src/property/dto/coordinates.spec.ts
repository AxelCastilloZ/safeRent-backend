import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdatePropertyDto } from './update-property.dto';

describe('Property coordinates', () => {
    it.each([
        {},
        { latitude: 9.935, longitude: -84.084 },
        { latitude: 0, longitude: 0 },
        { latitude: -90, longitude: 180 },
        { latitude: null, longitude: null },
    ])('accepts optional and valid coordinates: %j', async (data) => {
        expect(await validate(plainToInstance(UpdatePropertyDto, data))).toHaveLength(0);
    });

    it.each([
        { latitude: 91 },
        { latitude: -91 },
        { longitude: 181 },
        { longitude: -181 },
        { latitude: 'San José' },
        { longitude: '' },
    ])('rejects invalid coordinates: %j', async (data) => {
        expect((await validate(plainToInstance(UpdatePropertyDto, data))).length).toBeGreaterThan(0);
    });
});
