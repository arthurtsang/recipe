import { prisma } from '../lib/prisma';
import { extractJsonObject, nvidiaChat } from '../lib/nvidia';

export interface RecipeAnalysis {
  estimatedTime: string;
  difficulty: string;
  timeReasoning?: string;
  difficultyReasoning?: string;
  description?: string;
}

function buildAnalysisPrompt(
  title: string,
  description: string,
  ingredients: string,
  instructions: string
): string {
  return `You are an expert cooking instructor and recipe analyst. Analyze the following recipe and provide consistent, accurate assessments.

Recipe Title: ${title}
Description: ${description}

Ingredients:
${ingredients}

Instructions:
${instructions}

Please analyze this recipe and provide your assessment in the following JSON format:

{
  "estimatedTime": "time-range",
  "difficulty": "difficulty-level",
  "timeReasoning": "detailed explanation of time estimation",
  "difficultyReasoning": "detailed explanation of difficulty assessment"
}

For estimatedTime, provide a single approximate time in minutes:
- Return only the number of minutes as a string (e.g., "25", "45", "120")
- Consider total time including prep, cooking, and any waiting time
- Do not include "mins" or "minutes" - just the number

For difficulty, assess based on required cooking skills:
- "Easy": Basic skills
- "Medium": Intermediate skills
- "Advanced": Expert skills

Return ONLY valid JSON.`;
}

function buildDescriptionPrompt(title: string, ingredients: string, instructions: string): string {
  return `You are an expert food writer. Write a brief, appetizing description for this recipe.

Recipe Title: ${title}

Ingredients:
${ingredients}

Instructions:
${instructions}

Write a concise, engaging description (2-3 sentences). Provide only the description text, no additional formatting.`;
}

function parseAnalysis(raw: string): RecipeAnalysis {
  const json = extractJsonObject(raw);
  let estimatedTime = String(json?.estimatedTime ?? '30');
  let difficulty = String(json?.difficulty ?? 'Medium');

  const minutes = parseInt(estimatedTime, 10);
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 480) {
    estimatedTime = '30';
  }
  if (!['Easy', 'Medium', 'Advanced'].includes(difficulty)) {
    difficulty = 'Medium';
  }

  return {
    estimatedTime,
    difficulty,
    timeReasoning: String(json?.timeReasoning ?? ''),
    difficultyReasoning: String(json?.difficultyReasoning ?? ''),
  };
}

export async function analyzeRecipeWithAI(recipeId: string): Promise<RecipeAnalysis | null> {
  try {
    const recipe = await prisma.recipe.findUnique({
      where: { id: recipeId },
      include: { currentVersion: true },
    });

    if (!recipe || !recipe.currentVersion) {
      console.log(`[recipe-analysis] Recipe ${recipeId} not found or has no current version`);
      return null;
    }

    if (!needsMetadata(recipe.estimatedTime, recipe.difficulty)) {
      console.log(`[recipe-analysis] Recipe ${recipeId} already has metadata, skipping`);
      return null;
    }

    const title = recipe.title;
    const description = recipe.description || '';
    const ingredients = recipe.currentVersion.ingredients;
    const instructions = recipe.currentVersion.instructions;

    const analysisRaw = await nvidiaChat(
      [{ role: 'user', content: buildAnalysisPrompt(title, description, ingredients, instructions) }],
      { temperature: 0.3, maxTokens: 1024 }
    );
    const analysis = parseAnalysis(analysisRaw);

    if (!description.trim()) {
      try {
        const desc = await nvidiaChat(
          [{ role: 'user', content: buildDescriptionPrompt(title, ingredients, instructions) }],
          { temperature: 0.5, maxTokens: 256 }
        );
        analysis.description = desc.replace(/\*\*/g, '').slice(0, 500);
      } catch (e) {
        console.warn(`[recipe-analysis] Description generation failed for ${recipeId}:`, e);
      }
    }

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

    console.log(
      `[recipe-analysis] Successfully analyzed recipe ${recipeId}: ${analysis.estimatedTime}, ${analysis.difficulty}`
    );
    return analysis;
  } catch (error) {
    console.error(`[recipe-analysis] Error analyzing recipe ${recipeId}:`, error);
    return null;
  }
}

function isPlaceholderTime(value: string | null | undefined): boolean {
  if (value == null || !String(value).trim()) return true;
  const v = String(value).trim().toLowerCase();
  return v === 'pending...' || v === 'pending' || v === 'unknown' || v === 'n/a';
}

function isPlaceholderDifficulty(value: string | null | undefined): boolean {
  if (value == null || !String(value).trim()) return true;
  const v = String(value).trim().toLowerCase();
  return v === 'undetermined' || v === 'unknown' || v === 'n/a';
}

/** True when either field is missing or still a legacy placeholder from import. */
function needsMetadata(
  estimatedTime: string | null | undefined,
  difficulty: string | null | undefined
): boolean {
  return isPlaceholderTime(estimatedTime) || isPlaceholderDifficulty(difficulty);
}

export async function findRecipesNeedingAnalysis(limit: number = 10): Promise<string[]> {
  try {
    // Import now fills real time/difficulty in one NVIDIA call; this queue is a
    // fallback for older rows that still have null / Pending... / Undetermined.
    const recipes = await prisma.recipe.findMany({
      where: {
        currentVersionId: { not: null },
        OR: [
          { estimatedTime: null },
          { difficulty: null },
          { estimatedTime: { in: ['Pending...', 'Pending', 'pending...', 'pending'] } },
          { difficulty: { in: ['Undetermined', 'undetermined'] } },
        ],
      },
      select: { id: true },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
    return recipes.map((recipe) => recipe.id);
  } catch (error) {
    console.error('[recipe-analysis] Error finding recipes needing analysis:', error);
    return [];
  }
}

export async function processRecipeAnalysisQueue(): Promise<void> {
  try {
    console.log('[recipe-analysis] Starting recipe analysis queue processing...');
    const recipeIds = await findRecipesNeedingAnalysis(1);
    if (recipeIds.length === 0) {
      console.log('[recipe-analysis] No recipes need analysis');
      return;
    }
    const recipeId = recipeIds[0];
    console.log(`[recipe-analysis] Processing 1 recipe: ${recipeId}`);
    await analyzeRecipeWithAI(recipeId);
    console.log('[recipe-analysis] Recipe analysis queue processing complete');
  } catch (error) {
    console.error('[recipe-analysis] Error processing recipe analysis queue:', error);
  }
}

export function startRecipeAnalysisScheduler(): void {
  const interval = 5 * 60 * 1000;
  setInterval(async () => {
    await processRecipeAnalysisQueue();
  }, interval);
  console.log('[recipe-analysis] Recipe analysis scheduler started (every 5 minutes)');
}
