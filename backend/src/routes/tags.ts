import { Router } from 'express';
import * as tagController from '../controllers/tagController';
import { requiresAuth } from 'express-openid-connect';
import { requiresEnabledUser } from '../middleware/auth';

const router = Router();

router.get('/', tagController.getAllTags);
router.get('/:id', tagController.getTagById);
router.post('/', requiresAuth(), requiresEnabledUser(), tagController.createTag);
router.put('/:id', requiresAuth(), requiresEnabledUser(), tagController.updateTag);
router.delete('/:id', requiresAuth(), requiresEnabledUser(), tagController.deleteTag);

export default router; 