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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadImage = void 0;
exports.uploadImageHandler = uploadImageHandler;
exports.getAllRecipes = getAllRecipes;
exports.getRecipeById = getRecipeById;
exports.createRecipe = createRecipe;
exports.updateRecipe = updateRecipe;
exports.deleteRecipe = deleteRecipe;
exports.deleteRecipeVersion = deleteRecipeVersion;
exports.getRecipeRatings = getRecipeRatings;
exports.rateRecipe = rateRecipe;
exports.searchRecipes = searchRecipes;
exports.setAlias = setAlias;
exports.getRecipesByAlias = getRecipesByAlias;
exports.importRecipe = importRecipe;
exports.autoCategory = autoCategory;
exports.chat = chat;
exports.proxyImage = proxyImage;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const https_1 = __importDefault(require("https"));
const http_1 = __importDefault(require("http"));
const url_1 = require("url");
const crypto_1 = __importDefault(require("crypto"));
const recipeService = __importStar(require("../services/recipeService"));
const userService = __importStar(require("../services/userService"));
const client_1 = require("@prisma/client");
const axios_1 = __importDefault(require("axios"));
const prisma = new client_1.PrismaClient();
const uploadDir = path_1.default.join(__dirname, '../../uploads');
if (!fs_1.default.existsSync(uploadDir))
    fs_1.default.mkdirSync(uploadDir);
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const ext = path_1.default.extname(file.originalname);
        const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
        cb(null, name);
    },
});
const imageMimeTypes = [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/svg+xml', 'image/avif',
];
const upload = (0, multer_1.default)({
    storage,
    fileFilter: (req, file, cb) => {
        if (imageMimeTypes.includes(file.mimetype))
            cb(null, true);
        else
            cb(new Error('Only image files are allowed!'));
    },
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});
exports.uploadImage = upload.single('image');
function uploadImageHandler(req, res) {
    if (!req.file)
        return res.status(400).json({ error: 'No file uploaded' });
    // Return a URL relative to /uploads
    const url = `/uploads/${req.file.filename}`;
    res.json({ url });
}
function getAllRecipes(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const q = typeof req.query.q === 'string' ? req.query.q : undefined;
            const page = req.query.page ? parseInt(req.query.page, 10) : 1;
            const limit = req.query.limit ? parseInt(req.query.limit, 10) : 12;
            const recipes = yield recipeService.getAllPublicRecipes(q, page, limit);
            res.json(recipes);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch recipes' });
        }
    });
}
function getRecipeById(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const recipe = yield recipeService.getRecipeById(req.params.id);
            if (!recipe)
                return res.status(404).json({ error: 'Recipe not found' });
            console.log('Recipe loaded', recipe);
            // Use the current request's host instead of hardcoded BASE_URL
            if ((_a = recipe.imageUrl) === null || _a === void 0 ? void 0 : _a.startsWith('/uploads/')) {
                const protocol = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
                const host = req.get('host');
                recipe.imageUrl = `${protocol}://${host}${recipe.imageUrl}`;
            }
            res.json(recipe);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch recipe' });
        }
    });
}
// Function to download external image and save locally
function downloadAndSaveImage(imageUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (!imageUrl || !imageUrl.startsWith('http')) {
            return imageUrl; // Return as-is if not external URL
        }
        try {
            const url = new url_1.URL(imageUrl);
            const fileExt = ((_a = url.pathname.split('.').pop()) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || 'jpg';
            const validExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
            const ext = validExts.includes(fileExt) ? fileExt : 'jpg';
            // Generate unique filename
            const hash = crypto_1.default.createHash('md5').update(imageUrl).digest('hex');
            const filename = `recipe-${hash}.${ext}`;
            // Fix: Save to the same directory that the static middleware serves from
            const filepath = path_1.default.join(process.cwd(), 'uploads', filename);
            console.log(`Downloading image from ${imageUrl} to ${filepath}`);
            // Ensure uploads directory exists
            const uploadsDir = path_1.default.dirname(filepath);
            if (!fs_1.default.existsSync(uploadsDir)) {
                fs_1.default.mkdirSync(uploadsDir, { recursive: true });
            }
            // Check if file already exists
            if (fs_1.default.existsSync(filepath)) {
                console.log(`File already exists: ${filepath}`);
                return `/uploads/${filename}`;
            }
            // Download image
            const client = url.protocol === 'https:' ? https_1.default : http_1.default;
            return new Promise((resolve, reject) => {
                // Configure request options with SSL certificate ignore
                const requestOptions = {
                    timeout: 10000,
                    // Ignore SSL certificate errors for sites with self-signed certificates
                    rejectUnauthorized: false
                };
                const request = client.get(imageUrl, requestOptions, (response) => {
                    if (response.statusCode !== 200) {
                        console.warn(`Failed to download image from ${imageUrl}: HTTP ${response.statusCode}. Using original URL.`);
                        // For any non-200 status, fall back to original URL instead of failing
                        resolve(imageUrl);
                        return;
                    }
                    const fileStream = fs_1.default.createWriteStream(filepath);
                    response.pipe(fileStream);
                    fileStream.on('finish', () => {
                        fileStream.close();
                        console.log(`Successfully downloaded image to ${filepath}`);
                        resolve(`/uploads/${filename}`);
                    });
                    fileStream.on('error', (err) => {
                        console.error(`Error writing file ${filepath}:`, err);
                        fs_1.default.unlink(filepath, () => { }); // Delete partial file
                        reject(err);
                    });
                });
                request.on('error', (err) => {
                    console.error(`Error downloading from ${imageUrl}:`, err);
                    reject(err);
                });
                request.setTimeout(10000, () => {
                    request.destroy();
                    reject(new Error('Download timeout'));
                });
            });
        }
        catch (error) {
            console.error('Error in downloadAndSaveImage:', error);
            // If download fails, return original URL
            return imageUrl;
        }
    });
}
function createRecipe(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            const { title, description, ingredients, instructions, imageUrl, tags, cookTime, difficulty, timeReasoning, difficultyReasoning } = req.body;
            // Debug: Log the entire OIDC object
            console.log('OIDC object:', JSON.stringify(req.oidc, null, 2));
            // Use the same authentication pattern as rateRecipe
            if (!((_b = (_a = req.oidc) === null || _a === void 0 ? void 0 : _a.user) === null || _b === void 0 ? void 0 : _b.email))
                return res.status(401).json({ error: 'Not authenticated' });
            const dbUser = yield prisma.user.findUnique({ where: { email: req.oidc.user.email.toLowerCase() } });
            if (!dbUser)
                return res.status(401).json({ error: 'User not found' });
            console.log('Found user:', dbUser.id);
            // Download external image if provided
            const localImageUrl = imageUrl ? yield downloadAndSaveImage(imageUrl) : '';
            // Create the recipe first
            const recipe = yield prisma.recipe.create({
                data: {
                    title,
                    description,
                    imageUrl: localImageUrl,
                    userId: dbUser.id,
                    estimatedTime: cookTime, // Map cookTime to estimatedTime for database compatibility
                    difficulty,
                    timeReasoning,
                    difficultyReasoning,
                },
                include: {
                    user: true,
                },
            });
            // Create the initial version with ingredients and instructions
            const version = yield prisma.recipeVersion.create({
                data: {
                    recipeId: recipe.id,
                    title,
                    description: description || '',
                    ingredients: ingredients || '',
                    instructions: instructions || '',
                    imageUrl: localImageUrl,
                },
            });
            // Update the recipe to point to this version as current
            const updatedRecipe = yield prisma.recipe.update({
                where: { id: recipe.id },
                data: { currentVersionId: version.id },
                include: {
                    user: true,
                    currentVersion: true,
                },
            });
            res.status(201).json(updatedRecipe);
        }
        catch (err) {
            if (err && typeof err === 'object' && 'code' in err) {
                const dbError = err;
                if (dbError.code === 'P2002') {
                    return res.status(400).json({ error: 'Recipe with this title already exists' });
                }
            }
            console.error('Error creating recipe:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}
function updateRecipe(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            const { id } = req.params;
            const { title, description, ingredients, instructions, imageUrl, tags, cookTime, difficulty } = req.body;
            // Use the same authentication pattern as rateRecipe and createRecipe
            if (!((_b = (_a = req.oidc) === null || _a === void 0 ? void 0 : _a.user) === null || _b === void 0 ? void 0 : _b.email))
                return res.status(401).json({ error: 'Not authenticated' });
            const dbUser = yield prisma.user.findUnique({ where: { email: req.oidc.user.email.toLowerCase() } });
            if (!dbUser)
                return res.status(401).json({ error: 'User not found' });
            const userId = dbUser.id;
            // Check if user owns the recipe
            const existingRecipe = yield prisma.recipe.findUnique({
                where: { id: id },
                include: { currentVersion: true },
            });
            if (!existingRecipe) {
                return res.status(404).json({ error: 'Recipe not found' });
            }
            if (existingRecipe.userId !== userId) {
                return res.status(403).json({ error: 'Not authorized to update this recipe' });
            }
            // Download external image if provided and different from current
            const localImageUrl = imageUrl && imageUrl !== existingRecipe.imageUrl
                ? yield downloadAndSaveImage(imageUrl)
                : imageUrl;
            // Update the recipe
            const updatedRecipe = yield prisma.recipe.update({
                where: { id: id },
                data: {
                    title,
                    description,
                    imageUrl: localImageUrl,
                    estimatedTime: cookTime, // Map cookTime to estimatedTime for database compatibility
                    difficulty,
                },
            });
            // Update the current version
            if (existingRecipe.currentVersionId) {
                yield prisma.recipeVersion.update({
                    where: { id: existingRecipe.currentVersionId },
                    data: {
                        title,
                        description: description || '',
                        ingredients: ingredients || '',
                        instructions: instructions || '',
                        imageUrl: localImageUrl,
                    },
                });
            }
            // Return the updated recipe with current version
            const recipe = yield prisma.recipe.findUnique({
                where: { id: id },
                include: {
                    user: true,
                    currentVersion: true,
                },
            });
            res.json(recipe);
        }
        catch (err) {
            if (err && typeof err === 'object' && 'code' in err) {
                const dbError = err;
                if (dbError.code === 'P2002') {
                    return res.status(400).json({ error: 'Recipe with this title already exists' });
                }
            }
            console.error('Error updating recipe:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}
function deleteRecipe(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Fetch the recipe and its versions to get image URLs
            const recipe = yield prisma.recipe.findUnique({
                where: { id: req.params.id },
                include: { versions: true },
            });
            if (recipe) {
                // Delete main recipe image if local
                if (recipe.imageUrl && recipe.imageUrl.startsWith('/uploads/')) {
                    const imgPath = path_1.default.join(uploadDir, path_1.default.basename(recipe.imageUrl));
                    if (fs_1.default.existsSync(imgPath))
                        fs_1.default.unlinkSync(imgPath);
                }
                // Delete all version images if local
                for (const v of recipe.versions) {
                    if (v.imageUrl && v.imageUrl.startsWith('/uploads/')) {
                        const imgPath = path_1.default.join(uploadDir, path_1.default.basename(v.imageUrl));
                        if (fs_1.default.existsSync(imgPath))
                            fs_1.default.unlinkSync(imgPath);
                    }
                }
            }
            yield recipeService.deleteRecipe(req.params.id);
            res.status(204).send();
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to delete recipe' });
        }
    });
}
function deleteRecipeVersion(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id, versionId } = req.params;
            // Fetch the version to get image URL
            const version = yield prisma.recipeVersion.findUnique({ where: { id: versionId } });
            if (version && version.imageUrl && version.imageUrl.startsWith('/uploads/')) {
                const imgPath = path_1.default.join(uploadDir, path_1.default.basename(version.imageUrl));
                if (fs_1.default.existsSync(imgPath))
                    fs_1.default.unlinkSync(imgPath);
            }
            yield prisma.recipeVersion.delete({ where: { id: versionId } });
            // Return the updated recipe with all versions
            const recipe = yield prisma.recipe.findUnique({ where: { id }, include: { versions: true } });
            res.json(recipe);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to delete version' });
        }
    });
}
function getRecipeRatings(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            const { id } = req.params;
            const ratings = yield prisma.rating.findMany({ where: { recipeId: id } });
            const avg = ratings.length ? ratings.reduce((sum, r) => sum + r.value, 0) / ratings.length : null;
            let userRating = null;
            if ((_b = (_a = req.oidc) === null || _a === void 0 ? void 0 : _a.user) === null || _b === void 0 ? void 0 : _b.email) {
                const dbUser = yield prisma.user.findUnique({ where: { email: req.oidc.user.email.toLowerCase() } });
                if (dbUser) {
                    const r = ratings.find((r) => r.userId === dbUser.id);
                    if (r)
                        userRating = r.value;
                }
            }
            res.json({ average: avg, user: userRating });
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to get ratings' });
        }
    });
}
function rateRecipe(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            const { id } = req.params;
            const { value } = req.body;
            if (typeof value !== 'number' || value < 1 || value > 5) {
                return res.status(400).json({ error: 'Rating must be 1-5' });
            }
            if (!((_b = (_a = req.oidc) === null || _a === void 0 ? void 0 : _a.user) === null || _b === void 0 ? void 0 : _b.email))
                return res.status(401).json({ error: 'Not authenticated' });
            const dbUser = yield prisma.user.findUnique({ where: { email: req.oidc.user.email.toLowerCase() } });
            if (!dbUser)
                return res.status(401).json({ error: 'User not found' });
            yield prisma.rating.upsert({
                where: { userId_recipeId: { userId: dbUser.id, recipeId: id } },
                update: { value },
                create: { userId: dbUser.id, recipeId: id, value },
            });
            // Return updated average and user rating
            const ratings = yield prisma.rating.findMany({ where: { recipeId: id } });
            const avg = ratings.length ? ratings.reduce((sum, r) => sum + r.value, 0) / ratings.length : null;
            res.json({ average: avg, user: value });
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to rate recipe' });
        }
    });
}
function searchRecipes(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const keywords = Array.isArray(req.body.keywords) ? req.body.keywords : [];
            const page = req.body.page ? parseInt(req.body.page, 10) : 1;
            const limit = req.body.limit ? parseInt(req.body.limit, 10) : 12;
            const recipes = yield recipeService.searchRecipesByKeywords(keywords, page, limit);
            res.json(recipes);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to search recipes' });
        }
    });
}
function setAlias(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            if (!((_b = (_a = req.oidc) === null || _a === void 0 ? void 0 : _a.user) === null || _b === void 0 ? void 0 : _b.email))
                return res.status(401).json({ error: 'Not authenticated' });
            const dbUser = yield userService.getUserByEmail(req.oidc.user.email.toLowerCase());
            if (!dbUser)
                return res.status(404).json({ error: 'User not found' });
            const { alias } = req.body;
            if (!alias || typeof alias !== 'string')
                return res.status(400).json({ error: 'Alias required' });
            // Check for uniqueness
            const existing = yield userService.getUserByAlias(alias);
            if (existing && existing.id !== dbUser.id)
                return res.status(409).json({ error: 'Alias already taken' });
            yield userService.setUserAlias(dbUser.id, alias);
            res.json({ success: true, alias });
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to set alias' });
        }
    });
}
function getRecipesByAlias(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        try {
            const { alias } = req.params;
            const user = yield userService.getUserByAlias(alias);
            if (!user)
                return res.status(404).json({ error: 'User not found' });
            const isOwner = ((_c = (_b = (_a = req.oidc) === null || _a === void 0 ? void 0 : _a.user) === null || _b === void 0 ? void 0 : _b.email) === null || _c === void 0 ? void 0 : _c.toLowerCase()) === user.email;
            const recipes = yield recipeService.getRecipesByUserId(user.id, isOwner);
            res.json({ user, recipes });
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch user recipes' });
        }
    });
}
function importRecipe(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { url } = req.body;
            if (!url)
                return res.status(400).json({ error: 'URL is required' });
            // Call AI service to import recipe from external site
            const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8001';
            const response = yield axios_1.default.post(`${aiServiceUrl}/import-recipe`, { url });
            const importedData = response.data;
            // Don't download the image here - just return the external URL for preview
            // The image will be downloaded when the user actually saves the recipe
            res.status(200).json(importedData);
        }
        catch (err) {
            if (err && typeof err === 'object' && 'response' in err) {
                const axiosError = err;
                return res.status(axiosError.response.status).json(axiosError.response.data);
            }
            console.error('Error importing recipe:', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}
function autoCategory(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        try {
            const { title, description, ingredients, instructions } = req.body;
            if (!title && !description && !ingredients && !instructions) {
                return res.status(400).json({ error: 'At least one field is required' });
            }
            // Call AI service for category prediction
            const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8001';
            const response = yield axios_1.default.post(`${aiServiceUrl}/auto-category`, { title, description, ingredients, instructions });
            res.status(200).json(response.data);
        }
        catch (err) {
            if (err && typeof err === 'object' && 'response' in err) {
                const axiosError = err;
                res.status(((_a = axiosError.response) === null || _a === void 0 ? void 0 : _a.status) || 500).json({ error: ((_c = (_b = axiosError.response) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c.error) || axiosError.message });
            }
            else if (err instanceof Error) {
                res.status(500).json({ error: err.message });
            }
            else {
                res.status(500).json({ error: 'Failed to auto-categorize recipe' });
            }
        }
    });
}
function chat(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        try {
            const { question } = req.body;
            if (!question) {
                return res.status(400).json({ error: 'Question is required' });
            }
            // Call AI service for chat
            const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8001';
            const response = yield axios_1.default.post(`${aiServiceUrl}/chat`, { question });
            res.status(200).json(response.data);
        }
        catch (err) {
            if (err && typeof err === 'object' && 'response' in err) {
                const axiosError = err;
                res.status(((_a = axiosError.response) === null || _a === void 0 ? void 0 : _a.status) || 500).json({ error: ((_c = (_b = axiosError.response) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c.error) || axiosError.message });
            }
            else if (err instanceof Error) {
                res.status(500).json({ error: err.message });
            }
            else {
                res.status(500).json({ error: 'Failed to get chat response' });
            }
        }
    });
}
// Image proxy to handle CORS-blocked external images
function proxyImage(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { url } = req.query;
            if (!url || typeof url !== 'string') {
                return res.status(400).json({ error: 'URL parameter is required' });
            }
            // Validate that it's a proper image URL
            if (!url.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i)) {
                return res.status(400).json({ error: 'Invalid image URL' });
            }
            // Set appropriate headers to mimic a browser request
            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            };
            // For AllRecipes, add their domain as referrer
            if (url.includes('allrecipes.com')) {
                headers['Referer'] = 'https://www.allrecipes.com/';
            }
            const response = yield axios_1.default.get(url, {
                headers,
                responseType: 'stream',
                timeout: 10000,
                // Ignore SSL certificate errors for sites with self-signed certificates
                httpsAgent: new (require('https').Agent)({
                    rejectUnauthorized: false
                }),
                // Also ignore HTTP agent for completeness
                httpAgent: new (require('http').Agent)({
                    keepAlive: true
                })
            });
            // Set appropriate response headers
            res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
            res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
            // Pipe the image data to the response
            response.data.pipe(res);
        }
        catch (error) {
            console.error('Error proxying image:', error);
            res.status(500).json({ error: 'Failed to proxy image' });
        }
    });
}
