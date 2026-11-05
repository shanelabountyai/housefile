-- Housefile D-5: the billing module is removed, so its tables go too. Clone migration, not template-owned.
ALTER TABLE "BillingAccount" DROP CONSTRAINT "BillingAccount_orgId_fkey";
DROP TABLE "BillingAccount";
DROP TABLE "StripeEvent";
