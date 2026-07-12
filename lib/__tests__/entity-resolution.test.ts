import { describe, expect, it } from 'vitest';
import {
  generateMatchCandidates,
  mergeEntityFields,
  scorePair,
  ResolutionEntity,
} from '@/lib/entity-resolution';

function person(id: string, name: string, extra: Partial<ResolutionEntity> = {}): ResolutionEntity {
  return { id, type: 'person', canonicalName: name, aliases: [], attributes: {}, ...extra };
}

describe('scorePair', () => {
  it('flags exact name matches', () => {
    const result = scorePair(person('a', 'John Smith'), person('b', 'john  smith'));
    expect(result).toMatchObject({ score: 1.0, signals: ['exact_name'] });
  });

  it('flags a name contained in a longer name', () => {
    const result = scorePair(person('a', 'John Smith'), person('b', 'John Michael Smith'));
    expect(result).toMatchObject({ score: 0.85, signals: ['name_contains'] });
  });

  it('matches via aliases', () => {
    const result = scorePair(
      person('a', 'Jonathan Smith', { aliases: ['Johnny Smith'] }),
      person('b', 'Johnny Smith'),
    );
    expect(result).toMatchObject({ score: 1.0, signals: ['exact_name'] });
  });

  it('flags initial + last name matches', () => {
    const result = scorePair(person('a', 'J. Smith'), person('b', 'John Smith'));
    expect(result).toMatchObject({ score: 0.7, signals: ['initial_match'] });
  });

  it('boosts pairs sharing a hard identifier', () => {
    const result = scorePair(
      person('a', 'John Smith', { attributes: { phone: '(555) 123-4567' } }),
      person('b', 'J. Smith', { attributes: { phone: '555.123.4567' } }),
    );
    expect(result?.score).toBe(0.95);
    expect(result?.signals).toContain('shared_phone');
  });

  it('returns null for unrelated names and different types', () => {
    expect(scorePair(person('a', 'John Smith'), person('b', 'Maria Lopez'))).toBeNull();
    expect(scorePair(
      person('a', 'Elm Street'),
      { ...person('b', 'Elm Street'), type: 'location' },
    )).toBeNull();
  });
});

describe('generateMatchCandidates', () => {
  it('returns candidates sorted by score, only within the same type', () => {
    const candidates = generateMatchCandidates([
      person('a', 'John Smith'),
      person('b', 'John Michael Smith'),
      person('c', 'J. Smith'),
      { id: 'd', type: 'vehicle', canonicalName: 'John Smith', aliases: [], attributes: {} },
    ]);

    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidates[0].score).toBeGreaterThanOrEqual(candidates[candidates.length - 1].score);
    expect(candidates.every(c => c.entityAId !== 'd' && c.entityBId !== 'd')).toBe(true);
  });
});

describe('mergeEntityFields', () => {
  it('unions aliases, keeps primary name out of aliases, upgrades role, and prefers primary attributes', () => {
    const merged = mergeEntityFields(
      { canonicalName: 'John Michael Smith', aliases: ['Johnny'], role: 'witness', attributes: { age: 34 } },
      { canonicalName: 'John Smith', aliases: ['J. Smith', 'john michael smith'], role: 'suspect', attributes: { age: 35, occupation: 'mechanic' } },
    );

    expect(merged.aliases).toContain('John Smith');
    expect(merged.aliases).toContain('J. Smith');
    expect(merged.aliases).toContain('Johnny');
    expect(merged.aliases.map(a => a.toLowerCase())).not.toContain('john michael smith');
    expect(merged.role).toBe('suspect');
    expect(merged.attributes).toEqual({ age: 34, occupation: 'mechanic' });
  });
});
