import { Router } from 'express';
import * as tagController from '../controllers/tagController';
import { requiresAuth } from 'express-openid-connect';

const router = Router();

router.get('/', tagController.getAllTags);
router.get('/:id', tagController.getTagById);
router.post('/', requiresAuth(), tagController.createTag);
router.put('/:id', requiresAuth(), tagController.updateTag);
router.delete('/:id', requiresAuth(), tagController.deleteTag);

export default router; 