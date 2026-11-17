import { moduleExportTables } from '@/app/modules';
import type { ExportTable } from '@/core/tenancy/export';

// Clone-owned (v1.6.0), like org-hooks.ts: which tables a data export holds beyond the template's core ones
// (addendum §5). Add one entry per org-owned table, selecting only columns that are safe to hand over: never a
// sealed column, token hash or recovery code (INV-34 scans the output). Every query runs inside withOrg.
//   { name: 'Booking', rows: (tx, orgId) => tx.booking.findMany({ where: { orgId }, select: { id: true, startsAt: true } }) },
//
// D-104: every housefile table, every column, rows in id order, except ImportBatch.rawBytes (the uploaded file's bytes;
// its parsed rows, column map and contentHash are exported). None of these tables holds a secret: the sha256 columns
// (contentHash, planHash, beforeHash, definitionHash, memberListHash, the unmerge hashes) are content hashes of the
// org's own data, kept so an exported history can be re-proved.
export const housefileExportTables: readonly ExportTable[] = [
  { name: 'Constituent', rows: (tx, orgId) => tx.constituent.findMany({ where: { orgId }, orderBy: { id: 'asc' } }) },
  { name: 'Household', rows: (tx, orgId) => tx.household.findMany({ where: { orgId }, orderBy: { id: 'asc' } }) },
  { name: 'ConstituentVersion', rows: (tx, orgId) => tx.constituentVersion.findMany({ where: { orgId }, orderBy: { id: 'asc' } }) },
  { name: 'Fund', rows: (tx, orgId) => tx.fund.findMany({ where: { orgId }, orderBy: { id: 'asc' } }) },
  { name: 'Campaign', rows: (tx, orgId) => tx.campaign.findMany({ where: { orgId }, orderBy: { id: 'asc' } }) },
  { name: 'Appeal', rows: (tx, orgId) => tx.appeal.findMany({ where: { orgId }, orderBy: { id: 'asc' } }) },
  { name: 'Gift', rows: (tx, orgId) => tx.gift.findMany({ where: { orgId }, orderBy: { id: 'asc' } }) },
  { name: 'Pledge', rows: (tx, orgId) => tx.pledge.findMany({ where: { orgId }, orderBy: { id: 'asc' } }) },
  { name: 'SoftCredit', rows: (tx, orgId) => tx.softCredit.findMany({ where: { orgId }, orderBy: { id: 'asc' } }) },
  { name: 'ImportBatch', rows: (tx, orgId) => tx.importBatch.findMany({ where: { orgId }, orderBy: { id: 'asc' }, omit: { rawBytes: true } }) },
  { name: 'ImportBatchEvent', rows: (tx, orgId) => tx.importBatchEvent.findMany({ where: { orgId }, orderBy: { id: 'asc' } }) },
  { name: 'ReviewItem', rows: (tx, orgId) => tx.reviewItem.findMany({ where: { orgId }, orderBy: { id: 'asc' } }) },
  { name: 'ReviewDecision', rows: (tx, orgId) => tx.reviewDecision.findMany({ where: { orgId }, orderBy: { id: 'asc' } }) },
  { name: 'PairMemory', rows: (tx, orgId) => tx.pairMemory.findMany({ where: { orgId }, orderBy: { id: 'asc' } }) },
  { name: 'MergeEvent', rows: (tx, orgId) => tx.mergeEvent.findMany({ where: { orgId }, orderBy: { id: 'asc' } }) },
  { name: 'UnmergeEvent', rows: (tx, orgId) => tx.unmergeEvent.findMany({ where: { orgId }, orderBy: { id: 'asc' } }) },
  { name: 'SegmentDefinition', rows: (tx, orgId) => tx.segmentDefinition.findMany({ where: { orgId }, orderBy: { id: 'asc' } }) },
  { name: 'SegmentRun', rows: (tx, orgId) => tx.segmentRun.findMany({ where: { orgId }, orderBy: { id: 'asc' } }) },
  { name: 'Letter', rows: (tx, orgId) => tx.letter.findMany({ where: { orgId }, orderBy: { id: 'asc' } }) },
];

export const exportTables: readonly ExportTable[] = [
  ...moduleExportTables,
  ...housefileExportTables,
];

// An org-owned table left out on purpose, with the reason. INV-34 fails on any model with an orgId column that is in
// neither list, so a new table cannot silently drop out of every export.
export const exportSkipped: Readonly<Record<string, string>> = {};
