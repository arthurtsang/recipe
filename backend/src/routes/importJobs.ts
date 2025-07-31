import express from 'express';
import { startImport, getImportStatus, getUserImports, deleteImportJob } from '../controllers/importJobController';
import { requiresEnabledUser } from '../index';

const router = express.Router();

// Start a new import job
router.post('/start', requiresEnabledUser(), startImport);

// Get status of a specific import job
router.get('/status/:jobId', requiresEnabledUser(), getImportStatus);

// Get all import jobs for the current user
router.get('/user', requiresEnabledUser(), getUserImports);

// Delete an import job
router.delete('/:jobId', requiresEnabledUser(), deleteImportJob);

export default router; 