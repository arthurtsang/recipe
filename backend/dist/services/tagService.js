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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllTags = getAllTags;
exports.getTagById = getTagById;
exports.createTag = createTag;
exports.updateTag = updateTag;
exports.deleteTag = deleteTag;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
function getAllTags() {
    return __awaiter(this, void 0, void 0, function* () {
        return prisma.tag.findMany();
    });
}
function getTagById(id) {
    return __awaiter(this, void 0, void 0, function* () {
        return prisma.tag.findUnique({ where: { id } });
    });
}
function createTag(name) {
    return __awaiter(this, void 0, void 0, function* () {
        return prisma.tag.create({ data: { name } });
    });
}
function updateTag(id, name) {
    return __awaiter(this, void 0, void 0, function* () {
        return prisma.tag.update({ where: { id }, data: { name } });
    });
}
function deleteTag(id) {
    return __awaiter(this, void 0, void 0, function* () {
        return prisma.tag.delete({ where: { id } });
    });
}
