// Task 2.9: the import-graph check is green on the tree and red on a planted violation.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { findViolations } from '../../scripts/write-guard';

const PLANTED = 'src/app/_planted-write-guard';
afterEach(() => rmSync(PLANTED, { recursive: true, force: true }));

describe('write guard (D-64)', () => {
  it('only src/commit writes the Phase 2 tables', () => {
    expect(findViolations()).toEqual([]);
  });
  it('is red on a planted model write and on a planted raw write', () => {
    mkdirSync(PLANTED, { recursive: true });
    writeFileSync(`${PLANTED}/a.ts`, "import { db } from '@/core/db';\nexport const f = () => db.gift.create({ data: {} as never });\n");
    writeFileSync(`${PLANTED}/b.ts`, "import { db } from '@/core/db';\nexport const g = () => db.$executeRawUnsafe('UPDATE \"ConstituentVersion\" SET email = $1');\n");
    writeFileSync(`${PLANTED}/c.ts`, "import { db } from '@/core/db';\nexport const h = () => db.gift.findMany(); // reads are fine; a comment may say db.gift.create(\n");
    const v = findViolations();
    expect(v.map((x) => `${x.file}:${x.line}`)).toEqual([`${PLANTED}/a.ts:2`, `${PLANTED}/b.ts:2`]);
  });
});
