"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const importJobController_1 = require("../controllers/importJobController");
const index_1 = require("../index");
const router = express_1.default.Router();
// Start a new import job
router.post('/start', (0, index_1.requiresEnabledUser)(), importJobController_1.startImport);
// Get status of a specific import job
router.get('/status/:jobId', (0, index_1.requiresEnabledUser)(), importJobController_1.getImportStatus);
// Get all import jobs for the current user
router.get('/user', (0, index_1.requiresEnabledUser)(), importJobController_1.getUserImports);
// Delete an import job
router.delete('/:jobId', (0, index_1.requiresEnabledUser)(), importJobController_1.deleteImportJob);
exports.default = router;
