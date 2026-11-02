import { DataSource } from 'typeorm';
import { CommentService } from './comment.service';

describe('Ratings of an owner’s properties', () => {
  it('asks only for the owner’s properties, visible comments and scored comments, and returns what the database computed', async () => {
    const query = jest.fn().mockResolvedValue([{ propertyId: 5, average: 4.3, count: 3 }]);
    const service = new CommentService({ query } as unknown as DataSource);

    const result = await service.ratingsForOwner(2);

    expect(result).toEqual([{ propertyId: 5, average: 4.3, count: 3 }]);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual([2]);
    expect(sql).toContain('p."ownerId" = $1');
    expect(sql).toContain('c.hidden = false');
    expect(sql).toContain('c.rating IS NOT NULL');
    expect(sql).toContain('GROUP BY c."propertyId"');
  });
});
