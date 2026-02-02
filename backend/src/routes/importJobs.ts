import express from 'express';
import { startImport, getImportStatus, getUserImports, deleteImportJob, updateImportJobRecipe, saveImportedRecipe } from '../controllers/importJobController';
import { requiresEnabledUser } from '../middleware/auth';

const router = express.Router();

// Start a new import job
router.post('/start', requiresEnabledUser(), async (req, res, next) => {
  console.log('[ROUTE] /api/imports/start hit, calling startImport');
  try {
    await startImport(req, res);
  } catch (error) {
    next(error);
  }
});

// Get all import jobs for the current user
router.get('/user', requiresEnabledUser(), getUserImports);

// Get status of a specific import job
router.get('/status/:jobId', requiresEnabledUser(), getImportStatus);

// Atomically create recipe from import result and set savedRecipeId (idempotent)
router.post('/:jobId/save-recipe', requiresEnabledUser(), saveImportedRecipe);

// Update import job with saved recipe ID (must come before /:jobId delete route)
router.put('/:jobId/recipe', requiresEnabledUser(), updateImportJobRecipe);

// Delete an import job (must be last to avoid matching other routes)
router.delete('/:jobId', requiresEnabledUser(), deleteImportJob);

export default router; 