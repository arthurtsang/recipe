import { Router, Request, Response, NextFunction } from 'express';
import * as recipeController from '../controllers/recipeController';
import { uploadImage, uploadImageHandler } from '../controllers/recipeController';
import { requiresEnabledUser } from '../middleware/auth';

const router = Router();

router.get('/', recipeController.getAllRecipes);
router.get('/media', recipeController.serveRecipeMedia);
router.get('/proxy-image', recipeController.proxyImage);
router.get('/:id', recipeController.getRecipeById);
router.post('/', requiresEnabledUser(), recipeController.createRecipe);
router.post('/upload', requiresEnabledUser(), uploadImage, uploadImageHandler);
router.put('/:id', requiresEnabledUser(), recipeController.updateRecipe);
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