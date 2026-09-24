ALTER TABLE "metrobistro"."Recipe" ADD COLUMN IF NOT EXISTS "validated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "metrobistro"."Recipe" ADD COLUMN IF NOT EXISTS "validatedAt" TIMESTAMP(3);
