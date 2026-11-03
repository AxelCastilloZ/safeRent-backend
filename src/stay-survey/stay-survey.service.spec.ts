import { average, summarize } from './stay-survey.service';

describe('Stay survey summary', () => {
  it('averages with one decimal and ignores missing values', () => {
    expect(average([1.5, null, 2.5])).toBe(2);
    expect(average([null, undefined])).toBeNull();
    expect(average([4, 5, 5])).toBe(4.7);
  });

  it('summarizes what tenants answered', () => {
    const summary = summarize([
      { waterStability: 5, electricityStability: 4, internetMbps: 100, universityKm: 1, coworkingKm: null, hasWorkArea: true },
      { waterStability: 3, electricityStability: 4, internetMbps: 50, universityKm: 2, coworkingKm: null, hasWorkArea: true },
      { waterStability: 4, electricityStability: 3, internetMbps: 30, universityKm: null, coworkingKm: 4, hasWorkArea: false },
    ]);
    expect(summary).toEqual({
      count: 3, waterStability: 4, electricityStability: 3.7, internetMbps: 60, universityKm: 1.5, coworkingKm: 4, workAreaVotes: 2, hasWorkArea: true,
    });
  });

  it('needs a majority to say the property has a work area, and nothing without answers', () => {
    const base = { waterStability: 3, electricityStability: 3, internetMbps: 10, universityKm: null, coworkingKm: null };
    expect(summarize([{ ...base, hasWorkArea: true }, { ...base, hasWorkArea: false }]).hasWorkArea).toBe(false);
    expect(summarize([])).toMatchObject({ count: 0, waterStability: null, hasWorkArea: false });
  });
});
