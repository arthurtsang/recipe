import { Router, Request, Response, NextFunction } from 'express';
import * as recipeController from '../controllers/recipeController';
import { uploadImage, uploadImageHandler } from '../controllers/recipeController';
import { validateRecipe } from '../controllers/validateRecipe';
import { requiresEnabledUser } from '../middleware/auth';

const router = Router();

function requireRecipeContent(req: Request, res: Response, next: NextFunction) {
  const { title, ingredients, instructions } = req.body || {};
  const isCreate = req.method === 'POST';
  if (isCreate || title !== undefined) {
    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Recipe name is required' });
    }
  }
  if (isCreate || ingredients !== undefined || instructions !== undefined) {
    const hasIngredients = typeof ingredients === 'string' && ingredients.trim().length > 0;
    const hasInstructions = typeof instructions === 'string' && instructions.trim().length > 0;
    if (!hasIngredients && !hasInstructions) {
      return res.status(400).json({ error: 'Add ingredients or instructions' });
    }
  }
  next();
}

router.get('/', recipeController.getAllRecipes);
router.get('/media', recipeController.serveRecipeMedia);
router.get('/proxy-image', recipeController.proxyImage);
router.get('/:id', recipeController.getRecipeById);
router.post('/', requiresEnabledUser(), requireRecipeContent, recipeController.createRecipe);
router.post('/upload', requiresEnabledUser(), uploadImage, uploadImageHandler);
router.put('/:id', requiresEnabledUser(), requireRecipeContent, recipeController.updateRecipe);
router.post('/:id/validate', requiresEnabledUser(), validateRecipe);
router.delete('/:id', requiresEnabledUser(), recipeController.deleteRecipe);
router.delete('/:id/versions/:versionId', requiresEnabledUser(), recipeController.deleteRecipeVersion);
router.get('/:id/ratings', recipeController.getRecipeRatings);
router.post('/:id/ratings', requiresEnabledUser(), recipeController.rateRecipe);
router.post('/search', recipeController.searchRecipes);
router.post('/set-alias', requiresEnabledUser(), recipeController.setAlias);
router.get('/user/:alias', recipeController.getRecipesByAlias);
router.post('/auto-category', requiresEnabledUser(), recipeController.autoCategory);
router.post('/chat', requiresEnabledUser(), recipeController.chat);

// Test endpoint to trigger recipe analysis (for development)
router.post('/test-analysis', requiresEnabledUser(), async (req, res) => {
  try {
    const { processRecipeAnalysisQueue } = await import('../services/recipeAnalysisService');
    await processRecipeAnalysisQueue();
    res.json({ message: 'Recipe analysis queue processed' });
  } catch (error) {
    console.error('Error triggering recipe analysis:', error);
    res.status(500).json({ error: 'Failed to trigger recipe analysis' });
  }
});

export default router;
