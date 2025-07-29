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
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
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
            recipe.imageUrl = ((_a = recipe.imageUrl) === null || _a === void 0 ? void 0 : _a.startsWith('/uploads/')) ? `${process.env.BASE_URL}${recipe.imageUrl}` : recipe.imageUrl;
            res.json(recipe);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch recipe' });
        }
    });
}
function createRecipe(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        try {
            if (!((_a = req.oidc) === null || _a === void 0 ? void 0 : _a.user) || !((_c = (_b = req.oidc) === null || _b === void 0 ? void 0 : _b.user) === null || _c === void 0 ? void 0 : _c.email)) {
                console.error('Not authenticated', req.oidc);
                return res.status(401).json({ error: 'Not authenticated !!' });
            }
            // Fetch the user from the DB using the email
            const dbUser = yield userService.getUserByEmail(req.oidc.user.email.toLowerCase());
            if (!dbUser) {
                console.error('User not found in DB', req.oidc.user.email);
                return res.status(401).json({ error: 'User not found in DB' });
            }
            const userId = dbUser.id;
            console.log('Creating recipe for user', userId);
            const recipe = yield recipeService.createRecipe(Object.assign(Object.assign({}, req.body), { userId }));
            console.log('Recipe created', recipe);
            res.status(201).json(recipe);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to create recipe' });
        }
    });
}
function updateRecipe(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const recipe = yield recipeService.updateRecipe(req.params.id, req.body);
            res.json(recipe);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to update recipe' });
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
        var _a, _b, _c;
        try {
            const { url } = req.body;
            if (!url)
                return res.status(400).json({ error: 'URL is required' });
            // Call AI service to import recipe from external site
            const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8001';
            const response = yield axios_1.default.post(`${aiServiceUrl}/import-recipe`, { url });
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
                res.status(500).json({ error: 'Failed to import recipe' });
            }
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
