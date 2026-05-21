import dotenv from 'dotenv';
import app from './app';
import { startRecipeAnalysisScheduler } from './services/recipeAnalysisService';
import { startImportJobScheduler } from './services/importJobService';
import { getBaseUrl } from './lib/baseUrl';
import { isServerless } from './lib/serverless';

dotenv.config();

export { prisma } from './lib/prisma';
export { requiresEnabledUser } from './middleware/auth';

if (!isServerless()) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`Server running on ${getBaseUrl()} (port ${PORT})`);
    startRecipeAnalysisScheduler();
    startImportJobScheduler();
  });
}
