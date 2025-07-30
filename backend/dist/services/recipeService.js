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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllPublicRecipes = getAllPublicRecipes;
exports.getRecipeById = getRecipeById;
exports.createRecipe = createRecipe;
exports.updateRecipe = updateRecipe;
exports.deleteRecipe = deleteRecipe;
exports.searchRecipesByKeywords = searchRecipesByKeywords;
exports.getRecipesByUserId = getRecipesByUserId;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
function getAllPublicRecipes(q_1) {
    return __awaiter(this, arguments, void 0, function* (q, page = 1, limit = 12) {
        const where = { isPublic: true };
        if (q) {
            where.OR = [
                { title: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
                { versions: { some: { ingredients: { contains: q, mode: 'insensitive' } } } },
            ];
        }
        const recipes = yield prisma.recipe.findMany({
            where,
            select: {
                id: true,
                title: true,
                description: true,
                imageUrl: true,
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                createdAt: true,
                updatedAt: true,
                ratings: {
                    select: { value: true }
                },
            },
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
        });
        // Map ratings to averageRating and remove ratings array
        return recipes.map((r) => {
            const averageRating = r.ratings.length
                ? r.ratings.reduce((sum, rat) => sum + rat.value, 0) / r.ratings.length
                : null;
            const { ratings } = r, rest = __rest(r, ["ratings"]);
            return Object.assign(Object.assign({}, rest), { averageRating });
        });
    });
}
function getRecipeById(id) {
    return __awaiter(this, void 0, void 0, function* () {
        return prisma.recipe.findUnique({
            where: { id, isPublic: true },
            include: {
                user: { select: { id: true, name: true, email: true } },
                versions: true,
                ratings: true,
                comments: true,
                tags: { include: { tag: true } },
            },
        });
    });
}
function createRecipe(data) {
    return __awaiter(this, void 0, void 0, function* () {
        return prisma.recipe.create({
            data: {
                title: data.title,
                description: data.description,
                imageUrl: data.imageUrl,
                userId: data.userId,
                isPublic: true,
                versions: {
                    create: [{
                            title: data.title,
                            ingredients: data.ingredients,
                            instructions: data.instructions,
                            description: data.description,
                            imageUrl: data.imageUrl,
                        }],
                },
            },
            include: { versions: true },
        });
    });
}
function updateRecipe(id, data) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const createNew = data.createNewVersion !== false;
        if (createNew) {
            // Create a new version
            const recipe = yield prisma.recipe.update({
                where: { id },
                data: {
                    title: data.title,
                    description: data.description,
                    imageUrl: data.imageUrl,
                    updatedAt: new Date(),
                    versions: {
                        create: [{
                                title: (_a = data.title) !== null && _a !== void 0 ? _a : '',
                                ingredients: (_b = data.ingredients) !== null && _b !== void 0 ? _b : '',
                                instructions: (_c = data.instructions) !== null && _c !== void 0 ? _c : '',
                                description: data.description,
                                imageUrl: data.imageUrl,
                                name: (_d = data.versionName) !== null && _d !== void 0 ? _d : new Date().toLocaleString(),
                            }],
                    },
                },
                include: { versions: true },
            });
            return recipe;
        }
        else if (data.versionId) {
            // Update the specified version
            const recipe = yield prisma.recipe.update({
                where: { id },
                data: {
                    title: data.title,
                    description: data.description,
                    imageUrl: data.imageUrl,
                    updatedAt: new Date(),
                    versions: {
                        update: {
                            where: { id: data.versionId },
                            data: {
                                title: data.title,
                                ingredients: data.ingredients,
                                instructions: data.instructions,
                                description: data.description,
                                imageUrl: data.imageUrl,
                                name: data.versionName,
                            },
                        },
                    },
                },
                include: { versions: true },
            });
            return recipe;
        }
        else {
            throw new Error('versionId is required to update an existing version');
        }
    });
}
function deleteRecipe(id) {
    return __awaiter(this, void 0, void 0, function* () {
        // Delete in the correct order to handle foreign key constraints
        return prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
            // First, delete all ratings for this recipe
            yield tx.rating.deleteMany({ where: { recipeId: id } });
            // Delete all comments for this recipe
            yield tx.comment.deleteMany({ where: { recipeId: id } });
            // Delete all recipe versions for this recipe
            yield tx.recipeVersion.deleteMany({ where: { recipeId: id } });
            // Delete all recipe tags for this recipe
            yield tx.recipeTag.deleteMany({ where: { recipeId: id } });
            // Finally, delete the recipe itself
            return tx.recipe.delete({ where: { id } });
        }));
    });
}
function searchRecipesByKeywords(keywords_1) {
    return __awaiter(this, arguments, void 0, function* (keywords, page = 1, limit = 12) {
        const where = { isPublic: true };
        if (keywords && keywords.length > 0) {
            where.OR = keywords.map((kw) => ([
                { title: { contains: kw, mode: 'insensitive' } },
                { description: { contains: kw, mode: 'insensitive' } },
                { versions: { some: { ingredients: { contains: kw, mode: 'insensitive' } } } },
                { versions: { some: { instructions: { contains: kw, mode: 'insensitive' } } } },
            ])).flat();
        }
        const recipes = yield prisma.recipe.findMany({
            where,
            select: {
                id: true,
                title: true,
                description: true,
                imageUrl: true,
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                createdAt: true,
                updatedAt: true,
                ratings: {
                    select: { value: true }
                },
                versions: {
                    select: {
                        ingredients: true,
                        instructions: true,
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
            },
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
        });
        // Map ratings to averageRating and remove ratings array
        return recipes.map((r) => {
            const averageRating = r.ratings.length
                ? r.ratings.reduce((sum, rat) => sum + rat.value, 0) / r.ratings.length
                : null;
            const { ratings } = r, rest = __rest(r, ["ratings"]);
            return Object.assign(Object.assign({}, rest), { averageRating });
        });
    });
}
function getRecipesByUserId(userId, isOwner) {
    return __awaiter(this, void 0, void 0, function* () {
        const where = { userId };
        if (!isOwner)
            where.isPublic = true;
        const recipes = yield prisma.recipe.findMany({
            where,
            select: {
                id: true,
                title: true,
                description: true,
                imageUrl: true,
                isPublic: true,
                tags: { include: { tag: true } },
                createdAt: true,
                updatedAt: true,
                ratings: { select: { value: true } },
                versions: {
                    select: { ingredients: true, instructions: true },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        return recipes.map((r) => {
            const averageRating = r.ratings.length
                ? r.ratings.reduce((sum, rat) => sum + rat.value, 0) / r.ratings.length
                : null;
            const { ratings } = r, rest = __rest(r, ["ratings"]);
            return Object.assign(Object.assign({}, rest), { averageRating });
        });
    });
}
