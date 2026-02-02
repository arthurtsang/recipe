import { prisma } from '../index';
import axios from 'axios';

export interface RecipeAnalysis {
  estimatedTime: string;
  difficulty: string;
  timeReasoning?: string;
  difficultyReasoning?: string;
  description?: string;
}

export async function analyzeRecipeWithAI(recipeId: string): Promise<RecipeAnalysis | null> {
  try {
    // Get the recipe with its current version
    const recipe = await prisma.recipe.findUnique({
      where: { id: recipeId },
      include: {
        currentVersion: true,
      },
    });

    if (!recipe || !recipe.currentVersion) {
      console.log(`[recipe-analysis] Recipe ${recipeId} not found or has no current version`);
      return null;
    }

    // Skip if recipe already has user-provided metadata
    if (recipe.estimatedTime || recipe.difficulty) {
      console.log(`[recipe-analysis] Recipe ${recipeId} already has metadata, skipping`);
      return null;
    }

    // Prepare data for AI analysis
    const analysisData = {
      title: recipe.title,
      description: recipe.description || '',
      ingredients: recipe.currentVersion.ingredients,
      instructions: recipe.currentVersion.instructions,
    };

    // Call AI service
    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8001';
    const response = await axios.post(`${aiServiceUrl}/analyze-recipe`, analysisData);

    const analysis: RecipeAnalysis = response.data;

    // Update the recipe with the analysis results
    await prisma.recipe.update({
      where: { id: recipeId },
      data: {
        estimatedTime: analysis.estimatedTime,
        difficulty: analysis.difficulty,
        timeReasoning: analysis.timeReasoning,
        difficultyReasoning: analysis.difficultyReasoning,
        description: analysis.description || recipe.description,
      },
    });

    console.log(`[recipe-analysis] Successfully analyzed recipe ${recipeId}: ${analysis.estimatedTime}, ${analysis.difficulty}`);
    return analysis;

  } catch (error) {
    console.error(`[recipe-analysis] Error analyzing recipe ${recipeId}:`, error);
    return null;
  }
}

export async function findRecipesNeedingAnalysis(limit: number = 10): Promise<string[]> {
  try {
    const recipes = await prisma.recipe.findMany({
      where: {
        AND: [
          { estimatedTime: null },
          { difficulty: null },
          { currentVersionId: { not: null } },
        ],
      },
      select: { id: true },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return recipes.map(recipe => recipe.id);
  } catch (error) {
    console.error('[recipe-analysis] Error finding recipes needing analysis:', error);
    return [];
  }
}

export async function processRecipeAnalysisQueue(): Promise<void> {
  try {
    console.log('[recipe-analysis] Starting recipe analysis queue processing...');
    // One recipe at a time to avoid overloading the AI server
    const recipeIds = await findRecipesNeedingAnalysis(1);

    if (recipeIds.length === 0) {
      console.log('[recipe-analysis] No recipes need analysis');
      return;
    }

    const recipeId = recipeIds[0];
    console.log(`[recipe-analysis] Processing 1 recipe: ${recipeId}`);

    try {
      await analyzeRecipeWithAI(recipeId);
      console.log('[recipe-analysis] Recipe analysis queue processing complete');
    } catch (error) {
      console.error(`[recipe-analysis] Failed to analyze recipe ${recipeId}:`, error);
    }

  } catch (error) {
    console.error('[recipe-analysis] Error processing recipe analysis queue:', error);
  }
}

// Function to start the background processing
export function startRecipeAnalysisScheduler(): void {
  // Process queue every 5 minutes
  const interval = 5 * 60 * 1000; // 5 minutes in milliseconds
  
  setInterval(async () => {
    await processRecipeAnalysisQueue();
  }, interval);

  console.log('[recipe-analysis] Recipe analysis scheduler started (every 5 minutes)');
} 