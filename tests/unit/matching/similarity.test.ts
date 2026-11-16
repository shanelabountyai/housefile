import { describe, expect, it } from 'vitest';
import { blockingKeys, jaroWinkler, soundex } from '@/matching';
import { round4 } from '@/matching/similarity';
import { normAddress, normEmail, normPhone, parseName } from '@/import/normalize';

describe('Jaro-Winkler (brief §6, GN-17)', () => {
  it('GN-17 JW(jon, john) = 0.9333', () => expect(jaroWinkler('jon', 'john')).toBe(0.9333));
  it('identical is 1, empty is 0', () => {
    expect(jaroWinkler('abc', 'abc')).toBe(1);
    expect(jaroWinkler('', 'abc')).toBe(0);
    expect(jaroWinkler('abc', '')).toBe(0);
  });
  it('no common letters is 0', () => expect(jaroWinkler('abc', 'xyz')).toBe(0));
  it('known values: martha/marhta 0.9611, dwayne/duane 0.84, dixon/dicksonx 0.8133', () => {
    expect(jaroWinkler('martha', 'marhta')).toBe(0.9611);
    expect(jaroWinkler('dwayne', 'duane')).toBe(0.84);
    expect(jaroWinkler('dixon', 'dicksonx')).toBe(0.8133);
  });
  it('is symmetric', () => expect(jaroWinkler('flores', 'florse')).toBe(jaroWinkler('florse', 'flores')));
  it('round4 rounds an exact tie to even, like the oracle', () => {
    expect(round4(0.03125)).toBe(0.0312);
    expect(round4(0.09375)).toBe(0.0938);
    expect(round4(0.93333333)).toBe(0.9333);
  });
});

describe('American Soundex (brief §6, GN-18)', () => {
  it('GN-18 Flores = Florse = F462', () => {
    expect(soundex('Flores')).toBe('F462');
    expect(soundex('Florse')).toBe('F462');
  });
  it.each([
    ['Robert', 'R163'],
    ['Rupert', 'R163'],
    ['Rubin', 'R150'],
    ['Ashcraft', 'A261'],
    ['Ashcroft', 'A261'],
    ['Tymczak', 'T522'],
    ['Pfister', 'P236'],
    ['Honeyman', 'H555'],
    ['Lee', 'L000'],
    ["O'Brien", 'O165'],
  ])('%s -> %s', (s, code) => expect(soundex(s)).toBe(code));
  it('no letters gives ""', () => expect(soundex('123')).toBe(''));
});

describe('blocking keys B1–B5 (brief §6)', () => {
  it('a full record carries all five keys; a nickname adds one B5 per canonical', () => {
    const r = {
      id: 'x',
      name: parseName({ first: 'Ted', last: 'Flores' }),
      email: normEmail('Ted@example.com').value,
      phone: normPhone('918-555-0142').value,
      addr: normAddress('12 Oak Street', 'Apt 4', '', '', '74105').value,
      dob: '',
    };
    expect([...blockingKeys(r)].sort()).toEqual(['B1:ted@example.com', 'B2:9185550142', 'B3:F462:74105', 'B4:12 OAK ST:74105', 'B5:E363:F462', 'B5:T360:F462']);
  });
  it('a transposed name with a surname change, no phone and no address has no key (B-0154 case)', () => {
    const r = { id: 'x', name: parseName({ first: '', last: '' }), email: '', phone: '', addr: normAddress('', '', '', '', '').value, dob: '' };
    expect(blockingKeys(r).size).toBe(0);
  });
  it('an initial-only first name still gives a B5 (soundex of the letter)', () => {
    const r = { id: 'x', name: parseName({ first: 'E.', last: 'Lopez' }), email: '', phone: '', addr: normAddress('', '', '', '', '').value, dob: '' };
    expect([...blockingKeys(r)]).toEqual(['B5:E000:L120']);
  });
});
