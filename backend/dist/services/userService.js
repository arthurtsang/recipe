"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserByEmail = getUserByEmail;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
function getUserByEmail(email) {
    return prisma.user.findUnique({ where: { email } });
}
