import { Router, Request, Response, NextFunction } from 'express';
import * as recipeController from '../controllers/recipeController';
import { uploadImage, uploadImageHandler } from '../controllers/recipeController';
import { requiresAuth } from 'express-openid-connect';
import { requiresEnabledUser } from '../middleware/auth';

const router = Router();

router.get('/', recipeController.getAllRecipes);
router.get('/media', recipeController.serveRecipeMedia);
router.get('/proxy-image', recipeController.proxyImage);
router.get('/:id', recipeController.getRecipeById);
router.post('/', requiresAuth(), requiresEnabledUser(), recipeController.createRecipe);
router.post('/upload', requiresAuth(), requiresEnabledUser(), uploadImage, uploadImageHandler);
router.put('/:id', requiresAuth(), requiresEnabledUser(), recipeController.updateRecipe);
router.delete('/:id', requiresAuth(), requiresEnabledUser(), recipeController.deleteRecipe);
router.delete('/:id/versions/:versionId', requiresAuth(), requiresEnabledUser(), recipeController.deleteRecipeVersion);
router.get('/:id/ratings', recipeController.getRecipeRatings);
router.post('/:id/ratings', requiresAuth(), requiresEnabledUser(), recipeController.rateRecipe);
router.post('/search', recipeController.searchRecipes);
router.post('/set-alias', requiresAuth(), requiresEnabledUser(), recipeController.setAlias);
router.get('/user/:alias', recipeController.getRecipesByAlias);
router.post('/auto-category', requiresAuth(), requiresEnabledUser(), recipeController.autoCategory);
router.post('/chat', requiresAuth(), requiresEnabledUser(), recipeController.chat);

// Test endpoint to trigger recipe analysis (for development)
router.post('/test-analysis', requiresAuth(), requiresEnabledUser(), async (req, res) => {
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