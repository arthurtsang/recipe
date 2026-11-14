import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import { Paper, Typography, Box, Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions, List, ListItem, ListItemButton, ListItemText, Checkbox, Rating, Alert, Slide, Link, CircularProgress, Chip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import VerifiedIcon from '@mui/icons-material/Verified';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { recipeImageSrc } from '../utils/recipeImageSrc';

interface User {
  id: string;
  name?: string;
  email: string;
  picture?: string;
}

interface Version {
  id?: string;
  title: string;
  description?: string;
  ingredients: string;
  instructions: string;
  imageUrl?: string;
  createdAt?: string;
  name?: string;
}

interface Recipe {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  sourceUrl?: string;
  validated?: boolean;
  validatedAt?: string | null;
  estimatedTime?: string;
  difficulty?: string;
  currentVersionId?: string | null;
  user: { id: string; name?: string; email: string; alias?: string | null; displayName?: string };
  versions: Version[];
}

const RecipeDetail: React.FC<{ user: User | null }> = ({ user }) => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editFields, setEditFields] = useState<Version | null>(null);
  const [selectedVersionIdx, setSelectedVersionIdx] = useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [newVariationOpen, setNewVariationOpen] = useState(false);
  const [newVariationName, setNewVariationName] = useState('');
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [highlightDiffs, setHighlightDiffs] = useState(() => {
    try { return localStorage.getItem('recipeHighlightDiffs') === '1'; } catch { return false; }
  });
  const [averageRating, setAverageRating] = useState<number | null>(null);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [originalFields, setOriginalFields] = useState<Version | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removingSource, setRemovingSource] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validateNotification, setValidateNotification] = useState<string | null>(null);
  const [multiplierInput, setMultiplierInput] = useState('1');

  useEffect(() => {
    if (!id) return;
    setMultiplierInput('1');
    setLoading(true);
    fetch(`/api/recipes/${id}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then(data => {
        setRecipe(data);
        const versions = Array.isArray(data.versions) ? data.versions : [];
        let idx = 0;
        if (data.currentVersionId && versions.length > 0) {
          const currentIdx = versions.findIndex((v: any) => v.id === data.currentVersionId);
          if (currentIdx >= 0) idx = currentIdx;
          else idx = versions.length - 1;
        }
        setSelectedVersionIdx(idx);
        if (versions.length > 0) {
          const v = versions[idx];
          setEditFields({ ...v, title: data.title, description: data.description, imageUrl: v.imageUrl ?? data.imageUrl ?? '' });
        }
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/recipes/${id}/ratings`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        setAverageRating(data.average);
        setUserRating(data.user);
      });
  }, [id, user]);

  const handleBack = () => navigate(-1);
  const isOwner = !!(user && recipe && recipe.user && user.id === recipe.user.id);
  const versions = (recipe?.versions || []).slice().sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return ta - tb;
  });
  const selectedVersion = versions[selectedVersionIdx] || {};

  const renderMarkdownWithBlankLines = (content: string) => {
    const str = String(content ?? '');
    const parts = str.split(/(\n{2,})/);
    const mdComponents = {
      p: ({ children }: { children?: React.ReactNode }) => <Typography component="p" sx={{ fontSize: 16, mb: 0.5 }}>{children}</Typography>,
      li: (props: { children?: React.ReactNode; node?: unknown }) => {
        const { children, node } = props;
        const checked = (node as { checked?: boolean } | undefined)?.checked;
        if (typeof checked === 'boolean') {
          return (
            <Box component="li" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, fontSize: 16, mb: 0.25, listStyle: 'none' }}>
              <Checkbox size="small" checked={checked} disabled sx={{ py: 0, mt: 0.25 }} />
              <Typography component="span" sx={{ fontSize: 16 }}>{children}</Typography>
            </Box>
          );
        }
        return <Typography component="li" sx={{ fontSize: 16, mb: 0.25 }}>{children}</Typography>;
      },
      ul: ({ children }: { children?: React.ReactNode }) => <Box component="ul" sx={{ m: 0, pl: 2 }}>{children}</Box>,
      ol: ({ children }: { children?: React.ReactNode }) => <Box component="ol" sx={{ m: 0, pl: 2 }}>{children}</Box>,
    };
    return (
      <>
        {parts.map((part, i) =>
          /^\n+$/.test(part) ? (
            <Box key={i} sx={{ minHeight: '1em' }} aria-hidden />
          ) : (
            <ReactMarkdown key={i} remarkPlugins={[remarkBreaks, remarkGfm]} components={mdComponents}>
              {part.replace(/\n/g, '  \n')}
            </ReactMarkdown>
          )
        )}
      </>
    );
  };

  const handleSelectVersion = (idx: number) => {
    setSelectedVersionIdx(idx);
    if (!recipe) return;
    const ver = versions[idx];
    setEditFields({ ...ver, title: recipe.title, description: recipe.description, imageUrl: ver?.imageUrl ?? recipe.imageUrl ?? '' });
  };

  const handleEdit = () => {
    setIsEditing(true);
    setOriginalFields(editFields);
    setImagePreview(null);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImagePreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('/api/recipes/upload', { method: 'POST', body: formData, credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to upload image');
      handleFieldChange('imageUrl', data.url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteImage = () => {
    handleFieldChange('imageUrl', '');
    setImagePreview(null);
  };

  const handleFieldChange = (field: keyof Version, value: string) => {
    setEditFields((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, [field]: value };
      if (isEditing && originalFields) {
        setHasUnsavedChanges(JSON.stringify(updated) !== JSON.stringify(originalFields));
      }
      return updated;
    });
  };

  const handleSave = async () => {
    if (!editFields) return;
    try {
      const payload = { ...editFields, createNewVersion: false, versionId: selectedVersion.id, cookTime: recipe?.estimatedTime, difficulty: recipe?.difficulty };
      const res = await fetch(`/api/recipes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to save');
      const data = await res.json();
      const vers = Array.isArray(data.versions) ? data.versions : [];
      setRecipe({ ...data, versions: vers });
      let newIdx = 0;
      if (selectedVersion.id && vers.length > 0) {
        newIdx = vers.findIndex((v: any) => v.id === selectedVersion.id);
        if (newIdx === -1) newIdx = 0;
      }
      newIdx = Math.min(newIdx, Math.max(0, vers.length - 1));
      let updatedEditFields;
      if (vers.length > 0) {
        setSelectedVersionIdx(newIdx);
        const v = vers[newIdx];
        updatedEditFields = { ...(v || {}), title: data.title ?? '', description: data.description ?? '', imageUrl: v?.imageUrl ?? data.imageUrl ?? '' };
      } else {
        setSelectedVersionIdx(0);
        updatedEditFields = { ...editFields, title: data.title, description: data.description, imageUrl: data.imageUrl ?? '' };
      }
      setEditFields(updatedEditFields);
      setOriginalFields(updatedEditFields);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setIsEditing(false);
    setHasUnsavedChanges(false);
  };

  const handleCreateVariation = async () => {
    setNewVariationOpen(false);
    if (!editFields || !newVariationName.trim()) return;
    try {
      const payload = { ...editFields, versionName: newVariationName.trim(), createNewVersion: true, cookTime: recipe?.estimatedTime, difficulty: recipe?.difficulty };
      const res = await fetch(`/api/recipes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to create variation');
      const data = await res.json();
      const vers = Array.isArray(data.versions) ? data.versions : [];
      setRecipe({ ...data, versions: vers });
      let newIdx = vers.length > 0 ? vers.length - 1 : 0;
      if (data.currentVersionId && vers.length > 0) {
        const idx = vers.findIndex((v: any) => v.id === data.currentVersionId);
        if (idx >= 0) newIdx = idx;
      }
      setSelectedVersionIdx(newIdx);
      if (vers.length > 0) {
        const v = vers[newIdx];
        const updated = { ...(v || {}), title: data.title ?? '', description: data.description ?? '', imageUrl: v?.imageUrl ?? data.imageUrl ?? '' };
        setEditFields(updated);
        setOriginalFields(updated);
      }
      setIsEditing(false);
      setHasUnsavedChanges(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCancel = () => {
    if (originalFields) setEditFields(originalFields);
    setImagePreview(null);
    setIsEditing(false);
    setHasUnsavedChanges(false);
  };

  const handleRatingChange = async (_event: any, newValue: number | null) => {
    if (!newValue) return;
    setUserRating(newValue);
    await fetch(`/api/recipes/${id}/ratings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ value: newValue }),
    }).then(res => res.json()).then(data => {
      setAverageRating(data.average);
      setUserRating(data.user);
    });
  };

  const handleRemoveSource = async () => {
    if (!id || !recipe?.sourceUrl) return;
    setRemovingSource(true);
    try {
      const res = await fetch(`/api/recipes/${id}/source`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to remove source');
      }
      setRecipe((prev) => (prev ? { ...prev, sourceUrl: '' } : prev));
    } catch (err: unknown) {
      setValidateNotification(err instanceof Error ? err.message : String(err));
    } finally {
      setRemovingSource(false);
    }
  };

  const handleValidate = async () => {
    if (!recipe?.id || !recipe.sourceUrl?.trim() || recipe.validated) return;
    setValidating(true);
    setValidateNotification(null);
    try {
      const response = await fetch(`/api/recipes/${recipe.id}/validate`, { method: 'POST', credentials: 'include' });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to validate recipe');
      }
      const updated = await response.json();
      setRecipe((prev) => prev ? { ...prev, ...updated } : updated);
    } catch (err) {
      setValidateNotification(err instanceof Error ? err.message : 'Failed to validate recipe');
    } finally {
      setValidating(false);
    }
  };

  const handleRenameVariation = async () => {
    const variationId = selectedVersion?.id;
    const name = renameName.trim();
    if (!id || !variationId || !name) return;
    setRenaming(true);
    setRenameError(null);
    try {
      const res = await fetch(`/api/recipes/${id}/versions/${variationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to rename variation');
      }
      setRecipe((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          versions: (prev.versions || []).map((v) => (v.id === variationId ? { ...v, name } : v)),
        };
      });
      setEditFields((prev) => (prev ? { ...prev, name } : prev));
      setRenameOpen(false);
    } catch (err: unknown) {
      setRenameError(err instanceof Error ? err.message : String(err));
    } finally {
      setRenaming(false);
    }
  };

  const variationLabelOf = (v: Version | undefined, idx: number) => {
    const named = v?.name?.trim();
    if (named) return named;
    if (v?.createdAt) return new Date(v.createdAt).toLocaleString();
    return `Variation ${idx + 1}`;
  };

  const handleDelete = async (deleteWholeRecipe = false) => {
    if (!id) return;
    const variationId = selectedVersion?.id;
    const label = variationLabelOf(selectedVersion, selectedVersionIdx);
    if (!deleteWholeRecipe) {
      if (!variationId) {
        setDeleteError('No variation selected');
        return;
      }
      if (deleteConfirmName.trim() !== label) {
        setDeleteError(`Type “${label}” to confirm`);
        return;
      }
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      if (deleteWholeRecipe) {
        const res = await fetch(`/api/recipes/${id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Failed to delete recipe');
        }
        setDeleteDialogOpen(false);
        navigate('/');
        return;
      }
      const res = await fetch(`/api/recipes/${id}/versions/${variationId}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to delete variation');
      }
      const recipeRes = await fetch(`/api/recipes/${id}`);
      const data = await recipeRes.json();
      const vers = Array.isArray(data.versions) ? data.versions : [];
      setRecipe({ ...data, versions: vers });
      let newIdx = 0;
      if (data.currentVersionId && vers.length > 0) {
        const idx = vers.findIndex((v: Version) => v.id === data.currentVersionId);
        if (idx >= 0) newIdx = idx;
      }
      setSelectedVersionIdx(newIdx);
      const next = vers[newIdx];
      setEditFields(next ? { ...next, title: data.title, description: data.description, imageUrl: next.imageUrl ?? data.imageUrl ?? '' } : null);
      setDeleteDialogOpen(false);
      setDeleteConfirmName('');
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  };

  const wordKey = (word: string) => word.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

  const wordsInLine = (line: string) => {
    const keys = new Set<string>();
    line.split(/\s+/).forEach((word) => {
      const key = wordKey(word);
      if (key) keys.add(key);
    });
    return keys;
  };

  const wordsSharedWithEveryOther = (line: string, otherTexts: string[]) => {
    const mine = wordsInLine(line);
    if (mine.size === 0) return { wholeLine: false, shared: mine };
    let shared = new Set(mine);
    let wholeLine = false;
    otherTexts.forEach((text) => {
      const otherLines = String(text ?? '').replace(/\r\n/g, '\n').split('\n');
      let best = new Set<string>();
      let bestScore = 0;
      otherLines.forEach((otherLine) => {
        const otherWords = wordsInLine(otherLine);
        let score = 0;
        mine.forEach((word) => { if (otherWords.has(word)) score += 1; });
        if (score > bestScore) {
          bestScore = score;
          best = otherWords;
        }
      });
      // Less than half the words match: this line is not in that variation.
      if (bestScore / mine.size < 0.5) wholeLine = true;
      const next = new Set<string>();
      shared.forEach((word) => { if (best.has(word)) next.add(word); });
      shared = next;
    });
    return { wholeLine, shared };
  };

  const renderDiffLines = (current: string | undefined, otherTexts: string[]) => (
    <>
      {String(current ?? '').replace(/\r\n/g, '\n').split('\n').map((line, i) => {
        const { wholeLine, shared } = wordsSharedWithEveryOther(line, otherTexts);
        const parts = line.split(/(\s+)/);
        return (
          <Typography key={i} component="div" sx={{ fontSize: 16, whiteSpace: 'pre-wrap', minHeight: '1.4em', color: wholeLine ? '#c62828' : 'inherit', fontWeight: wholeLine ? 700 : 400 }}>
            {line ? parts.map((part, j) => {
              if (wholeLine) return <span key={j}>{part}</span>;
              const key = wordKey(part);
              const changed = !!key && !shared.has(key);
              return changed
                ? <Box key={j} component="span" sx={{ color: '#c62828', fontWeight: 700 }}>{part}</Box>
                : <span key={j}>{part}</span>;
            }) : '\u00a0'}
          </Typography>
        );
      })}
    </>
  );

  const parseQtyToken = (token: string) => {
    const unicode: Record<string, number> = { '½': 1 / 2, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 1 / 4, '¾': 3 / 4, '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8 };
    const t = token.trim();
    if (unicode[t] != null) return unicode[t];
    const mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
    if (mixed) {
      const den = Number(mixed[3]);
      return den ? Number(mixed[1]) + Number(mixed[2]) / den : null;
    }
    const frac = t.match(/^(\d+)\/(\d+)$/);
    if (frac) {
      const den = Number(frac[2]);
      return den ? Number(frac[1]) / den : null;
    }
    const n = Number(t.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };

  const formatQty = (n: number) => {
    if (!Number.isFinite(n)) return '';
    const nearest = Math.round(n);
    if (Math.abs(n - nearest) < 0.001) return String(nearest);
    const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
    for (let den = 2; den <= 16; den += 1) {
      const num = Math.round(n * den);
      if (Math.abs(n - num / den) < 0.02) {
        const whole = Math.trunc(num / den);
        const rem = Math.abs(num % den);
        if (rem === 0) return String(whole);
        const g = gcd(rem, den);
        const frac = `${rem / g}/${den / g}`;
        return whole > 0 ? `${whole} ${frac}` : frac;
      }
    }
    return String(Math.round(n * 100) / 100);
  };

  const shouldScaleQty = (line: string, index: number, token: string) => {
    const before = line.slice(0, index);
    const after = line.slice(index + token.length);
    if (/[A-Za-z0-9/]$/.test(before)) return false;
    if (/[x×]\s*$/i.test(before)) return false;
    if (/^\s*$/.test(before) && /^\s*[.)]/.test(after)) return false;
    const rest = after.trimStart();
    if (/^(?:inch(?:es)?|°|degrees?|minutes?|hours?|seconds?)\b/i.test(rest)) return false;
    if (/^°/.test(rest)) return false;
    if (/^\s*x\s*\d/i.test(after)) return false;
    return true;
  };

  const renderScaledIngredients = (current: string | undefined, otherTexts: string[] | null, multiplier: number) => {
    const qtyRe = /(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?|[½⅓⅔¼¾⅛⅜⅝⅞])/g;
    return (
      <>
        {String(current ?? '').replace(/\r\n/g, '\n').split('\n').map((line, i) => {
          const diff = otherTexts ? wordsSharedWithEveryOther(line, otherTexts) : null;
          const chunks: { text: string; qty: boolean }[] = [];
          let last = 0;
          qtyRe.lastIndex = 0;
          let match: RegExpExecArray | null;
          while ((match = qtyRe.exec(line))) {
            if (!shouldScaleQty(line, match.index, match[0])) continue;
            if (match.index > last) chunks.push({ text: line.slice(last, match.index), qty: false });
            chunks.push({ text: match[0], qty: true });
            last = match.index + match[0].length;
          }
          if (last < line.length) chunks.push({ text: line.slice(last), qty: false });
          if (chunks.length === 0) chunks.push({ text: line, qty: false });
          return (
            <Typography key={i} component="div" sx={{ fontSize: 16, whiteSpace: 'pre-wrap', minHeight: '1.4em' }}>
              {line ? chunks.map((chunk, j) => {
                if (chunk.qty) {
                  const value = parseQtyToken(chunk.text);
                  const scaled = value == null ? '' : formatQty(value * multiplier);
                  return (
                    <span key={j}>
                      <span>{chunk.text}</span>
                      {scaled && (
                        <Box component="span" sx={{ color: '#1565c0', fontWeight: 700 }}>{` ${scaled}`}</Box>
                      )}
                    </span>
                  );
                }
                if (diff?.wholeLine) return <Box key={j} component="span" sx={{ color: '#c62828', fontWeight: 700 }}>{chunk.text}</Box>;
                if (!diff) return <span key={j}>{chunk.text}</span>;
                return (
                  <span key={j}>
                    {chunk.text.split(/(\s+)/).map((part, k) => {
                      const key = wordKey(part);
                      const changed = !!key && !diff.shared.has(key);
                      return changed
                        ? <Box key={k} component="span" sx={{ color: '#c62828', fontWeight: 700 }}>{part}</Box>
                        : <span key={k}>{part}</span>;
                    })}
                  </span>
                );
              }) : '\u00a0'}
            </Typography>
          );
        })}
      </>
    );
  };

  if (loading) return <Typography>{t('loadingRecipe')}</Typography>;
  if (error) return <Typography color="error">{t('error')}: {error}</Typography>;
  if (!recipe) return <Typography>{t('recipeNotFound')}</Typography>;

  const resolveImageUrl = (raw: string | undefined): string | null => {
    const u = recipeImageSrc(raw);
    return u ?? null;
  };
  const displayImageUrl = isOwner && isEditing
    ? (imagePreview ?? resolveImageUrl(editFields?.imageUrl ?? '') ?? null)
    : resolveImageUrl(editFields?.imageUrl ?? selectedVersion?.imageUrl ?? '');
  const hasImageInEdit = !!(editFields?.imageUrl && String(editFields.imageUrl).trim());
  const showDiffs = highlightDiffs && versions.length > 1 && !(isOwner && isEditing);
  const parsedMultiplier = Number(multiplierInput);
  const multiplier = Number.isFinite(parsedMultiplier) && parsedMultiplier > 0 ? parsedMultiplier : 1;
  const scaleIngredients = !(isOwner && isEditing) && Math.abs(multiplier - 1) > 0.0001;

  return (
    <Paper sx={{ p: 4, maxWidth: 900, mx: 'auto', width: '100%' }}>
      <Button variant="text" onClick={handleBack} sx={{ mb: 2 }}>&larr; {t('back')}</Button>
      <Box>
        <Slide direction="down" in={hasUnsavedChanges} mountOnEnter unmountOnExit>
          <Alert severity="warning" action={<Button color="inherit" size="small" onClick={handleCancel}>Cancel</Button>} sx={{ mb: 2, position: 'sticky', top: 0, zIndex: 1000 }}>
            You have unsaved changes
          </Alert>
        </Slide>
        {isOwner && isEditing ? (
          <TextField value={editFields?.title || ''} onChange={e => handleFieldChange('title', e.target.value)} variant="standard" fullWidth InputProps={{ disableUnderline: true, style: { fontSize: 32, fontWeight: 600 } }} sx={{ mb: 2 }} />
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
            <Typography variant="h4" gutterBottom sx={{ mb: 0 }}>{editFields?.title || recipe.title}</Typography>
            {recipe.validated && recipe.sourceUrl && (
              <Chip icon={<VerifiedIcon />} label={t('validated', 'Validated')} size="small" color="primary" variant="outlined" />
            )}
          </Box>
        )}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <TextField
          size="small"
          label="Multiply"
          type="number"
          value={multiplierInput}
          onChange={(e) => setMultiplierInput(e.target.value)}
          inputProps={{ step: 'any', min: 0 }}
          sx={{ width: 140 }}
        />
      </Box>
      {(displayImageUrl || (isOwner && isEditing)) && (
        <Box mb={2}>
          {isOwner && isEditing ? (
            <>
              <Typography variant="subtitle2" gutterBottom>Image (upload file or enter URL)</Typography>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 1, flexWrap: 'wrap' }}>
                <Button variant="outlined" component="label" size="small">Upload Image<input type="file" accept="image/*" hidden onChange={handleImageUpload} /></Button>
                {(displayImageUrl || hasImageInEdit) && (
                  <Button variant="outlined" color="error" size="small" onClick={handleDeleteImage}>Delete image</Button>
                )}
              </Box>
              <TextField fullWidth size="small" label="Image URL" value={editFields?.imageUrl ?? ''} onChange={e => handleFieldChange('imageUrl', e.target.value)} placeholder="https://example.com/image.jpg" helperText="Enter a direct link to an image" sx={{ mb: 1 }} />
              {uploading && <Typography sx={{ mt: 1 }} component="span">Uploading...</Typography>}
              {displayImageUrl && (
                <img src={displayImageUrl} alt={editFields?.title || recipe?.title || ''} style={{ maxWidth: 400, width: '100%', objectFit: 'contain' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              )}
            </>
          ) : (
            displayImageUrl && (
              <img src={displayImageUrl} alt={editFields?.title || recipe?.title || ''} style={{ maxWidth: 400, width: '100%', objectFit: 'contain' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            )
          )}
        </Box>
      )}
      <Box display="flex" alignItems="center" mb={2}>
        <Rating name="user-rating" value={userRating} onChange={handleRatingChange} size="large" />
        <Typography variant="body2" sx={{ ml: 2 }}>
          {averageRating ? `${t('averageRating')}: ${averageRating.toFixed(2)} / 5` : `${t('noRatingsYet')}`}
        </Typography>
      </Box>
      <Typography variant="subtitle1" color="text.secondary" gutterBottom>
        {isOwner && isEditing ? (
          <TextField value={editFields?.description || ''} onChange={e => handleFieldChange('description', e.target.value)} variant="standard" fullWidth multiline InputProps={{ disableUnderline: true, style: { fontSize: 18 } }} />
        ) : (
          editFields?.description || selectedVersion.description
        )}
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="subtitle2" color="text.secondary">Cook Time:</Typography>
          {isOwner && isEditing ? (
            <TextField type="number" value={recipe?.estimatedTime || ''} onChange={(e) => { setRecipe(prev => prev ? { ...prev, estimatedTime: e.target.value } : null); }} size="small" sx={{ minWidth: 120 }} placeholder="Enter minutes" label="Minutes" inputProps={{ min: 1, max: 480 }} />
          ) : (
            <Typography variant="body1">
              {recipe?.estimatedTime ? (() => {
                const minutes = parseInt(recipe.estimatedTime);
                if (minutes >= 60) {
                  const hours = Math.floor(minutes / 60);
                  const remainingMins = minutes % 60;
                  return remainingMins === 0 ? `${hours}h` : `${hours}h ${remainingMins}m`;
                }
                return `${minutes}m`;
              })() : 'Pending...'}
            </Typography>
          )}
        </Box>
        <Box>
          <Typography variant="subtitle2" color="text.secondary">Difficulty:</Typography>
          {isOwner && isEditing ? (
            <TextField select value={recipe?.difficulty || ''} onChange={(e) => { setRecipe(prev => prev ? { ...prev, difficulty: e.target.value } : null); }} size="small" sx={{ minWidth: 120 }}>
              <option value="">Undetermined</option>
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Advanced">Advanced</option>
            </TextField>
          ) : (
            <Typography variant="body1">{recipe?.difficulty || 'Undetermined'}</Typography>
          )}
        </Box>
      </Box>
      <Typography variant="h6" mt={2}>{t('ingredients')}</Typography>
      <Box sx={{ background: '#f5f5f5', p: 2, borderRadius: 1, overflowX: 'auto', '& p': { margin: '0.25em 0' }, '& ul, & ol': { margin: '0.25em 0', pl: 2 } }}>
        {isOwner && isEditing ? (
          <TextField value={editFields?.ingredients || ''} onChange={e => handleFieldChange('ingredients', e.target.value)} variant="standard" fullWidth multiline minRows={4} placeholder="One per line or use markdown." InputProps={{ disableUnderline: true, style: { fontFamily: 'inherit', fontSize: 16 } }} />
        ) : scaleIngredients ? (
          renderScaledIngredients(
            editFields?.ingredients ?? selectedVersion?.ingredients,
            showDiffs ? versions.filter((_, idx) => idx !== selectedVersionIdx).map((v) => v.ingredients || '') : null,
            multiplier
          )
        ) : showDiffs ? (
          renderDiffLines(editFields?.ingredients ?? selectedVersion?.ingredients, versions.filter((_, idx) => idx !== selectedVersionIdx).map((v) => v.ingredients || ''))
        ) : (
          renderMarkdownWithBlankLines(editFields?.ingredients ?? selectedVersion?.ingredients ?? '')
        )}
      </Box>
      <Typography variant="h6" mt={2}>{t('instructions')}</Typography>
      <Box sx={{ background: '#f5f5f5', p: 2, borderRadius: 1, '& p': { margin: '0.25em 0' }, '& ul, & ol': { margin: '0.25em 0', pl: 2 } }}>
        {isOwner && isEditing ? (
          <TextField value={editFields?.instructions || ''} onChange={e => handleFieldChange('instructions', e.target.value)} variant="standard" fullWidth multiline minRows={6} placeholder="One step per line or use markdown." InputProps={{ disableUnderline: true, style: { fontFamily: 'inherit', fontSize: 16 } }} />
        ) : showDiffs ? (
          renderDiffLines(editFields?.instructions ?? selectedVersion?.instructions, versions.filter((_, idx) => idx !== selectedVersionIdx).map((v) => v.instructions || ''))
        ) : (
          renderMarkdownWithBlankLines(editFields?.instructions ?? selectedVersion?.instructions ?? '')
        )}
      </Box>
      <Box sx={{ fontSize: '0.9em', color: 'text.secondary', mt: 2 }}>
        {t('by')}: {(recipe.user?.alias && recipe.user.alias.trim()) ? (
          <Link component={RouterLink} to={`/users/${recipe.user.alias.trim()}`} color="inherit" underline="hover">
            {recipe.user.displayName ?? (recipe.user.alias || recipe.user.name || recipe.user.email)}
          </Link>
        ) : (
          recipe.user?.alias || recipe.user?.name || recipe.user?.email
        )}
        {recipe.sourceUrl && (
          <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="body2" component="span" color="text.secondary">Source: {' '}</Typography>
            <Link href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer" sx={{ color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
              {recipe.sourceUrl}
            </Link>
            {isOwner && (
              <Button size="small" color="error" disabled={removingSource} onClick={handleRemoveSource}>
                {removingSource ? 'Removing…' : 'Remove source'}
              </Button>
            )}
          </Box>
        )}
      </Box>
      {versions.length > 0 && (
        <Box mt={3} mb={2} sx={{ position: 'relative' }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {versions.length > 1 ? t('versions') : t('version')} ({versions.length}):
          </Typography>
          <Box sx={{ position: 'relative', overflowX: 'auto', maxWidth: '100%' }}>
            <List dense sx={{ display: 'flex', flexDirection: 'row', gap: 1, p: 0, minHeight: 48 }}>
              {versions.map((v: Version, idx: number) => (
                <ListItem key={v.id || idx} disablePadding sx={{ width: 'auto', minWidth: 120 }}>
                  <ListItemButton selected={idx === selectedVersionIdx} onClick={() => handleSelectVersion(idx)}>
                    <ListItemText primary={v.name ? v.name : (v.createdAt ? new Date(v.createdAt).toLocaleString() : `${t('version')} ${idx + 1}`)} />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Box>
          {versions.length > 1 && (
            <Button
              sx={{ mt: 1 }}
              variant={highlightDiffs ? 'contained' : 'outlined'}
              color={highlightDiffs ? 'error' : 'primary'}
              onClick={() => {
                const next = !highlightDiffs;
                setHighlightDiffs(next);
                try { localStorage.setItem('recipeHighlightDiffs', next ? '1' : '0'); } catch { /* ignore */ }
              }}
            >
              {highlightDiffs ? 'Differences highlighted' : 'Highlight differences'}
            </Button>
          )}
        </Box>
      )}
      {isOwner && (
        <Box mt={3}>
          {validateNotification && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setValidateNotification(null)}>{validateNotification}</Alert>
          )}
          <Box display="flex" gap={2} flexWrap="wrap">
            {!isEditing ? (
              <Button variant="contained" color="primary" onClick={handleEdit} startIcon={<EditIcon />}>{t('edit', 'Edit')}</Button>
            ) : (
              <Button variant="contained" color="primary" onClick={handleSave} startIcon={<SaveIcon />}>{t('save', 'Save')}</Button>
            )}
            <Button variant="outlined" onClick={() => { setNewVariationName(''); setNewVariationOpen(true); }}>New Variation</Button>
            <Button variant="outlined" onClick={() => { setRenameName(selectedVersion?.name || ''); setRenameError(null); setRenameOpen(true); }} disabled={!selectedVersion?.id}>Rename</Button>
            {recipe?.sourceUrl && !recipe.validated && (
              <Button variant="outlined" size="medium" onClick={handleValidate} disabled={validating} startIcon={validating ? <CircularProgress size={16} /> : <VerifiedIcon />} title="Mark this imported recipe as a Secret Garden recipe. It will no longer update from the original source.">
                {validating ? 'Validating…' : t('validate', 'Validate')}
              </Button>
            )}
            <Button variant="outlined" color="error" onClick={() => { setDeleteConfirmName(''); setDeleteError(null); setDeleteDialogOpen(true); }} disabled={deleting} startIcon={<DeleteIcon />}>{t('delete')}</Button>
          </Box>
        </Box>
      )}
      <Dialog open={renameOpen} onClose={() => { if (!renaming) setRenameOpen(false); }}>
        <DialogTitle>Rename variation</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>This only changes the name. Ingredients and instructions stay as they are.</Typography>
          <TextField autoFocus margin="dense" label="Variation name" type="text" fullWidth value={renameName} onChange={e => { setRenameName(e.target.value); setRenameError(null); }} />
          {renameError && <Alert severity="error" sx={{ mt: 1 }}>{renameError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameOpen(false)} disabled={renaming}>{t('cancel')}</Button>
          <Button onClick={handleRenameVariation} variant="contained" disabled={renaming || !renameName.trim()}>{renaming ? 'Saving…' : 'Save name'}</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={newVariationOpen} onClose={() => setNewVariationOpen(false)}>
        <DialogTitle>New Variation</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>Name this variation (for example Parmesan or Havarti).</Typography>
          <TextField autoFocus margin="dense" label="Variation name" type="text" fullWidth value={newVariationName} onChange={e => setNewVariationName(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewVariationOpen(false)}>{t('cancel')}</Button>
          <Button onClick={handleCreateVariation} variant="contained" disabled={!newVariationName.trim()}>Create</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={deleteDialogOpen} onClose={() => { if (!deleting) setDeleteDialogOpen(false); }}>
        <DialogTitle>Delete variation</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            Type <strong>{variationLabelOf(selectedVersion, selectedVersionIdx)}</strong> to delete this variation.
          </Typography>
          <TextField
            autoFocus
            margin="dense"
            label="Variation name"
            type="text"
            fullWidth
            value={deleteConfirmName}
            onChange={e => { setDeleteConfirmName(e.target.value); setDeleteError(null); }}
          />
          {deleteError && <Alert severity="error" sx={{ mt: 1 }}>{deleteError}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>{t('cancel')}</Button>
          <Button
            onClick={() => handleDelete(false)}
            color="error"
            variant="contained"
            disabled={deleting || deleteConfirmName.trim() !== variationLabelOf(selectedVersion, selectedVersionIdx)}
          >
            {deleting ? 'Deleting…' : 'Delete variation'}
          </Button>
          <Button onClick={() => handleDelete(true)} color="error" variant="outlined" disabled={deleting}>{t('deleteRecipe')}</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default RecipeDetail;
