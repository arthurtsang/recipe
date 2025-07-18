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
exports.getAllTags = getAllTags;
exports.getTagById = getTagById;
exports.createTag = createTag;
exports.updateTag = updateTag;
exports.deleteTag = deleteTag;
const tagService = __importStar(require("../services/tagService"));
function getAllTags(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const tags = yield tagService.getAllTags();
            res.json(tags);
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to fetch tags' });
        }
    });
}
function getTagById(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const tag = yield tagService.getTagById(req.params.id);
            if (!tag)
                return res.status(404).json({ error: 'Tag not found' });
            res.json(tag);
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to fetch tag' });
        }
    });
}
function createTag(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { name } = req.body;
            if (!name)
                return res.status(400).json({ error: 'Name is required' });
            const tag = yield tagService.createTag(name);
            res.status(201).json(tag);
        }
        catch (err) {
            if (err.code === 'P2002') {
                res.status(409).json({ error: 'Tag name must be unique' });
            }
            else {
                res.status(500).json({ error: 'Failed to create tag' });
            }
        }
    });
}
function updateTag(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { name } = req.body;
            if (!name)
                return res.status(400).json({ error: 'Name is required' });
            const tag = yield tagService.updateTag(req.params.id, name);
            res.json(tag);
        }
        catch (err) {
            if (err.code === 'P2002') {
                res.status(409).json({ error: 'Tag name must be unique' });
            }
            else {
                res.status(500).json({ error: 'Failed to update tag' });
            }
        }
    });
}
function deleteTag(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield tagService.deleteTag(req.params.id);
            res.status(204).send();
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to delete tag' });
        }
    });
}
