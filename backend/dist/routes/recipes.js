"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const recipeController = __importStar(require("../controllers/recipeController"));
const recipeController_1 = require("../controllers/recipeController");
const express_openid_connect_1 = require("express-openid-connect");
const router = (0, express_1.Router)();
router.get('/', recipeController.getAllRecipes);
router.get('/proxy-image', recipeController.proxyImage);
router.get('/:id', recipeController.getRecipeById);
router.post('/', (0, express_openid_connect_1.requiresAuth)(), recipeController.createRecipe);
router.post('/upload', (0, express_openid_connect_1.requiresAuth)(), recipeController_1.uploadImage, recipeController_1.uploadImageHandler);
router.put('/:id', (0, express_openid_connect_1.requiresAuth)(), recipeController.updateRecipe);
router.delete('/:id', (0, express_openid_connect_1.requiresAuth)(), recipeController.deleteRecipe);
router.delete('/:id/versions/:versionId', (0, express_openid_connect_1.requiresAuth)(), recipeController.deleteRecipeVersion);
router.get('/:id/ratings', recipeController.getRecipeRatings);
router.post('/:id/ratings', (0, express_openid_connect_1.requiresAuth)(), recipeController.rateRecipe);
router.post('/search', recipeController.searchRecipes);
router.post('/set-alias', (0, express_openid_connect_1.requiresAuth)(), recipeController.setAlias);
router.get('/user/:alias', recipeController.getRecipesByAlias);
router.post('/import', (0, express_openid_connect_1.requiresAuth)(), recipeController.importRecipe);
router.post('/auto-category', (0, express_openid_connect_1.requiresAuth)(), recipeController.autoCategory);
router.post('/chat', recipeController.chat);
// Test endpoint to trigger recipe analysis (for development)
router.post('/test-analysis', (0, express_openid_connect_1.requiresAuth)(), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { processRecipeAnalysisQueue } = yield Promise.resolve().then(() => __importStar(require('../services/recipeAnalysisService')));
        yield processRecipeAnalysisQueue();
        res.json({ message: 'Recipe analysis queue processed' });
    }
    catch (error) {
        console.error('Error triggering recipe analysis:', error);
        res.status(500).json({ error: 'Failed to trigger recipe analysis' });
    }
}));
exports.default = router;
