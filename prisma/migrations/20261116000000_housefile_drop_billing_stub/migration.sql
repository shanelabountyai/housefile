-- Housefile: drops the stub from 20261104000000_housefile_billing_stub, now that every template policy migration
-- that ALTERs "BillingAccount" has run (README "Removing a module": date the drop after the template's newest migration).
DROP TABLE "BillingAccount";
