import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import * as recipeService from '../services/recipeService';

export async function validateRecipe(req: Request, res: Response) {
  try {
    if (!req.oidc?.user?.email) return res.status(401).json({ error: 'Not authenticated' });
    const dbUser = await prisma.user.findUnique({ where: { email: req.oidc.user.email.toLowerCase() } });
    if (!dbUser) return res.status(401).json({ error: 'User not found' });

    const recipe = await prisma.recipe.findUnique({ where: { id: req.params.id } });
    if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
    if (recipe.userId !== dbUser.id) return res.status(403).json({ error: 'Not authorized to validate this recipe' });
    if (!recipe.sourceUrl) return res.status(400).json({ error: 'Only imported recipes can be validated' });
    if (recipe.validated) {
      const current = await recipeService.getRecipeById(recipe.id);
      return res.json(current);
    }

    await prisma.recipe.update({
      where: { id: recipe.id },
      data: { validated: true, validatedAt: new Date() },
    });
    const updated = await recipeService.getRecipeById(recipe.id);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to validate recipe' });
  }
}
