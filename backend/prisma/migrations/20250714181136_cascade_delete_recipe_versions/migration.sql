-- DropForeignKey
ALTER TABLE "RecipeVersion" DROP CONSTRAINT "RecipeVersion_recipeId_fkey";

-- AddForeignKey
ALTER TABLE "RecipeVersion" ADD CONSTRAINT "RecipeVersion_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
