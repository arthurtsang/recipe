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
exports.createImportJob = createImportJob;
exports.getImportJob = getImportJob;
exports.getUserImportJobs = getUserImportJobs;
exports.updateImportJobStatus = updateImportJobStatus;
exports.processImportJob = processImportJob;
exports.cleanupOldImportJobs = cleanupOldImportJobs;
const index_1 = require("../index");
const axios_1 = __importDefault(require("axios"));
function createImportJob(userId, url) {
    return __awaiter(this, void 0, void 0, function* () {
        return index_1.prisma.importJob.create({
            data: {
                userId,
                url,
                status: 'pending',
            },
        });
    });
}
function getImportJob(id) {
    return __awaiter(this, void 0, void 0, function* () {
        return index_1.prisma.importJob.findUnique({
            where: { id },
        });
    });
}
function getUserImportJobs(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        return index_1.prisma.importJob.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
        });
    });
}
function updateImportJobStatus(id, status, result, error) {
    return __awaiter(this, void 0, void 0, function* () {
        return index_1.prisma.importJob.update({
            where: { id },
            data: {
                status,
                result,
                error,
                updatedAt: new Date(),
            },
        });
    });
}
function processImportJob(jobId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Get the job
            const job = yield getImportJob(jobId);
            if (!job) {
                throw new Error('Import job not found');
            }
            // Update status to processing
            yield updateImportJobStatus(jobId, 'processing');
            // Call AI service to import recipe
            const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8001';
            const response = yield axios_1.default.post(`${aiServiceUrl}/import-recipe`, {
                url: job.url,
            });
            // Update job with result
            yield updateImportJobStatus(jobId, 'completed', response.data);
        }
        catch (error) {
            console.error(`Error processing import job ${jobId}:`, error);
            // Update job with error
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            yield updateImportJobStatus(jobId, 'failed', undefined, errorMessage);
        }
    });
}
function cleanupOldImportJobs() {
    return __awaiter(this, void 0, void 0, function* () {
        // Delete import jobs older than 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        yield index_1.prisma.importJob.deleteMany({
            where: {
                createdAt: {
                    lt: sevenDaysAgo,
                },
            },
        });
    });
}
