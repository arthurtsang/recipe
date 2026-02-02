-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "apiToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_apiToken_key" ON "User"("apiToken");
