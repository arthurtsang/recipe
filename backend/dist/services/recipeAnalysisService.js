"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeRecipeWithAI = analyzeRecipeWithAI;
exports.findRecipesNeedingAnalysis = findRecipesNeedingAnalysis;
exports.processRecipeAnalysisQueue = processRecipeAnalysisQueue;
exports.startRecipeAnalysisScheduler = startRecipeAnalysisScheduler;
const index_1 = require("../index");
const axios_1 = __importDefault(require("axios"));
function analyzeRecipeWithAI(recipeId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Get the recipe with its current version
            const recipe = yield index_1.prisma.recipe.findUnique({
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
            const response = yield axios_1.default.post(`${aiServiceUrl}/analyze-recipe`, analysisData);
            const analysis = response.data;
            // Update the recipe with the analysis results
            yield index_1.prisma.recipe.update({
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
        }
        catch (error) {
            console.error(`[recipe-analysis] Error analyzing recipe ${recipeId}:`, error);
            return null;
        }
    });
}
function findRecipesNeedingAnalysis() {
    return __awaiter(this, arguments, void 0, function* (limit = 10) {
        try {
            const recipes = yield index_1.prisma.recipe.findMany({
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
        }
        catch (error) {
            console.error('[recipe-analysis] Error finding recipes needing analysis:', error);
            return [];
        }
    });
}
function processRecipeAnalysisQueue() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log('[recipe-analysis] Starting recipe analysis queue processing...');
            // Find recipes that need analysis
            const recipeIds = yield findRecipesNeedingAnalysis(5); // Process 5 at a time
            if (recipeIds.length === 0) {
                console.log('[recipe-analysis] No recipes need analysis');
                return;
            }
            console.log(`[recipe-analysis] Found ${recipeIds.length} recipes needing analysis`);
            // Process each recipe
            for (const recipeId of recipeIds) {
                try {
                    yield analyzeRecipeWithAI(recipeId);
                    // Add a small delay between requests to avoid overwhelming the AI service
                    yield new Promise(resolve => setTimeout(resolve, 2000));
                }
                catch (error) {
                    console.error(`[recipe-analysis] Failed to analyze recipe ${recipeId}:`, error);
                }
            }
            console.log('[recipe-analysis] Recipe analysis queue processing complete');
        }
        catch (error) {
            console.error('[recipe-analysis] Error processing recipe analysis queue:', error);
        }
    });
}
// Function to start the background processing
function startRecipeAnalysisScheduler() {
    // Process queue every 5 minutes
    const interval = 5 * 60 * 1000; // 5 minutes in milliseconds
    setInterval(() => __awaiter(this, void 0, void 0, function* () {
        yield processRecipeAnalysisQueue();
    }), interval);
    console.log('[recipe-analysis] Recipe analysis scheduler started (every 5 minutes)');
}
