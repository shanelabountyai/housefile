-- Housefile D-5 / v1.6.x merge (see docs/decisions.md): billing was dropped in 20261019000000_housefile_drop_billing,
-- but the template's RLS policy migrations 20261105000000..20261108000002 ALTER "BillingAccount" unguarded (CHANGELOG
-- 1.6.2 F-09). This stub gives them a table to act on; 20261116000000_housefile_drop_billing_stub drops it again.
-- Clone migration, not template-owned. Same pattern as gavel D-102 (stub-table pair).
CREATE TABLE "BillingAccount" ("orgId" UUID NOT NULL PRIMARY KEY);
