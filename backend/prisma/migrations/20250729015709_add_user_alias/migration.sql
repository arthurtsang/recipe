-- AlterTable
ALTER TABLE "User" ADD COLUMN "alias" TEXT;
 
-- CreateIndex
CREATE UNIQUE INDEX "User_alias_key" ON "User"("alias"); 