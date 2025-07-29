import { Request, Response } from 'express';
import * as tagService from '../services/tagService';

export async function getAllTags(req: Request, res: Response) {
  try {
    const tags = await tagService.getAllTags();
    res.json(tags);
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
}

export async function getTagById(req: Request, res: Response) {
  try {
    const tag = await tagService.getTagById(req.params.id);
    if (!tag) return res.status(404).json({ error: 'Tag not found' });
    res.json(tag);
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to fetch tag' });
  }
}

export async function createTag(req: Request, res: Response) {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const tag = await tagService.createTag(name);
    res.status(201).json(tag);
  } catch (err: unknown) {
    if ((err as any).code === 'P2002') {
      res.status(409).json({ error: 'Tag name must be unique' });
    } else {
      res.status(500).json({ error: 'Failed to create tag' });
    }
  }
}

export async function updateTag(req: Request, res: Response) {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const tag = await tagService.updateTag(req.params.id, name);
    res.json(tag);
  } catch (err: unknown) {
    if ((err as any).code === 'P2002') {
      res.status(409).json({ error: 'Tag name must be unique' });
    } else {
      res.status(500).json({ error: 'Failed to update tag' });
    }
  }
}

export async function deleteTag(req: Request, res: Response) {
  try {
    await tagService.deleteTag(req.params.id);
    res.status(204).send();
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to delete tag' });
  }
} 