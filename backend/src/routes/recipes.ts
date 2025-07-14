import { Router, Request, Response, NextFunction } from 'express';
import * as recipeController from '../controllers/recipeController';
import { uploadImage, uploadImageHandler } from '../controllers/recipeController';
import { requiresAuth } from 'express-openid-connect';

const router = Router();

router.get('/', recipeController.getAllRecipes);
router.get('/:id', recipeController.getRecipeById);
router.post('/', requiresAuth(), recipeController.createRecipe);
router.post('/upload', requiresAuth(), uploadImage, uploadImageHandler);
router.put('/:id', requiresAuth(), recipeController.updateRecipe);
router.delete('/:id', requiresAuth(), recipeController.deleteRecipe);
router.delete('/:id/versions/:versionId', requiresAuth(), recipeController.deleteRecipeVersion);
router.get('/:id/ratings', recipeController.getRecipeRatings);
router.post('/:id/ratings', requiresAuth(), recipeController.rateRecipe);

export default router; 