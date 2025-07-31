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
exports.startImport = startImport;
exports.getImportStatus = getImportStatus;
exports.getUserImports = getUserImports;
exports.deleteImportJob = deleteImportJob;
const index_1 = require("../index");
const importJobService_1 = require("../services/importJobService");
function startImport(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            if (!((_b = (_a = req.oidc) === null || _a === void 0 ? void 0 : _a.user) === null || _b === void 0 ? void 0 : _b.email)) {
                return res.status(401).json({ error: 'Not authenticated' });
            }
            const dbUser = yield index_1.prisma.user.findUnique({
                where: { email: req.oidc.user.email.toLowerCase() }
            });
            if (!dbUser) {
                return res.status(401).json({ error: 'User not found' });
            }
            const { url } = req.body;
            if (!url) {
                return res.status(400).json({ error: 'URL is required' });
            }
            // Create import job
            const job = yield (0, importJobService_1.createImportJob)(dbUser.id, url);
            // Process job asynchronously (don't await)
            (0, importJobService_1.processImportJob)(job.id).catch(error => {
                console.error('Background import job failed:', error);
            });
            res.json({
                jobId: job.id,
                status: job.status,
                message: 'Import job started successfully'
            });
        }
        catch (error) {
            console.error('Error starting import:', error);
            res.status(500).json({ error: 'Failed to start import job' });
        }
    });
}
function getImportStatus(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            if (!((_b = (_a = req.oidc) === null || _a === void 0 ? void 0 : _a.user) === null || _b === void 0 ? void 0 : _b.email)) {
                return res.status(401).json({ error: 'Not authenticated' });
            }
            const dbUser = yield index_1.prisma.user.findUnique({
                where: { email: req.oidc.user.email.toLowerCase() }
            });
            if (!dbUser) {
                return res.status(401).json({ error: 'User not found' });
            }
            const { jobId } = req.params;
            const job = yield (0, importJobService_1.getImportJob)(jobId);
            if (!job) {
                return res.status(404).json({ error: 'Import job not found' });
            }
            // Check if user owns this job
            if (job.userId !== dbUser.id) {
                return res.status(403).json({ error: 'Not authorized to access this import job' });
            }
            res.json({
                id: job.id,
                url: job.url,
                status: job.status,
                result: job.result,
                error: job.error,
                createdAt: job.createdAt,
                updatedAt: job.updatedAt,
            });
        }
        catch (error) {
            console.error('Error getting import status:', error);
            res.status(500).json({ error: 'Failed to get import status' });
        }
    });
}
function getUserImports(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            if (!((_b = (_a = req.oidc) === null || _a === void 0 ? void 0 : _a.user) === null || _b === void 0 ? void 0 : _b.email)) {
                return res.status(401).json({ error: 'Not authenticated' });
            }
            const dbUser = yield index_1.prisma.user.findUnique({
                where: { email: req.oidc.user.email.toLowerCase() }
            });
            if (!dbUser) {
                return res.status(401).json({ error: 'User not found' });
            }
            const jobs = yield (0, importJobService_1.getUserImportJobs)(dbUser.id);
            res.json(jobs.map(job => ({
                id: job.id,
                url: job.url,
                status: job.status,
                result: job.result,
                error: job.error,
                createdAt: job.createdAt,
                updatedAt: job.updatedAt,
            })));
        }
        catch (error) {
            console.error('Error getting user imports:', error);
            res.status(500).json({ error: 'Failed to get user imports' });
        }
    });
}
function deleteImportJob(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            if (!((_b = (_a = req.oidc) === null || _a === void 0 ? void 0 : _a.user) === null || _b === void 0 ? void 0 : _b.email)) {
                return res.status(401).json({ error: 'Not authenticated' });
            }
            const dbUser = yield index_1.prisma.user.findUnique({
                where: { email: req.oidc.user.email.toLowerCase() }
            });
            if (!dbUser) {
                return res.status(401).json({ error: 'User not found' });
            }
            const { jobId } = req.params;
            const job = yield (0, importJobService_1.getImportJob)(jobId);
            if (!job) {
                return res.status(404).json({ error: 'Import job not found' });
            }
            // Check if user owns this job
            if (job.userId !== dbUser.id) {
                return res.status(403).json({ error: 'Not authorized to delete this import job' });
            }
            yield index_1.prisma.importJob.delete({
                where: { id: jobId },
            });
            res.json({ message: 'Import job deleted successfully' });
        }
        catch (error) {
            console.error('Error deleting import job:', error);
            res.status(500).json({ error: 'Failed to delete import job' });
        }
    });
}
