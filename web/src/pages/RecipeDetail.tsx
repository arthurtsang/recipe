import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import { Paper, Typography, Box, Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions, Checkbox, Alert, Slide, Link, CircularProgress, Chip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import VerifiedIcon from '@mui/icons-material/Verified';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { recipeImageSrc } from '../utils/recipeImageSrc';
import { QTY_SRC, canonicalQty, formatQty, hyphenateMixedFractions, isQtyUnit, normalizeIngredientText, parseQtyToken, shouldScaleQty } from '../utils/ingredientFormat';

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
          setEditFields({ ...v, title: data.title, description: data.description, imageUrl: data.imageUrl ?? '' });
        }
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [id]);

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
    setEditFields({ ...ver, title: recipe.title, description: recipe.description, imageUrl: recipe.imageUrl ?? '' });
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
      const payload = { ...editFields, ingredients: normalizeIngredientText(editFields.ingredients || ''), createNewVersion: false, versionId: selectedVersion.id, cookTime: recipe?.estimatedTime, difficulty: recipe?.difficulty };
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
        updatedEditFields = { ...(v || {}), title: data.title ?? '', description: data.description ?? '', imageUrl: data.imageUrl ?? '' };
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
      const payload = { ...editFields, ingredients: normalizeIngredientText(editFields.ingredients || ''), versionName: newVariationName.trim(), createNewVersion: true, cookTime: recipe?.estimatedTime, difficulty: recipe?.difficulty };
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
        const updated = { ...(v || {}), title: data.title ?? '', description: data.description ?? '', imageUrl: data.imageUrl ?? '' };
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
      setEditFields(next ? { ...next, title: data.title, description: data.description, imageUrl: data.imageUrl ?? '' } : null);
      setDeleteDialogOpen(false);
      setDeleteConfirmName('');
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  };

  const wordKey = (word: string) => word.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

  const tokenSpans = (text: string) => {
    const re = new RegExp(`(${QTY_SRC})|([\\p{L}]+)|([^\\p{L}\\p{N}\\s]+)`, 'gu');
    const spans: { key: string; start: number; end: number }[] = [];
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      const raw = match[0];
      if (/^\s+$/.test(raw)) continue;
      const key = match[1]
        ? canonicalQty(match[1])
        : match[2]
          ? wordKey(match[2])
          : raw;
      spans.push({ key, start: match.index, end: match.index + raw.length });
    }
    return spans;
  };

  const wordTokens = (text: string) => tokenSpans(text).filter((span) => /^[\p{L}\p{N}]+$/u.test(text.slice(span.start, span.end))).map((span) => span.key);

  const lcsKeep = (a: string[], b: string[]) => {
    const n = a.length;
    const m = b.length;
    const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
    for (let i = 1; i <= n; i += 1) {
      for (let j = 1; j <= m; j += 1) {
        dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
    const keep = Array(n).fill(false);
    let i = n;
    let j = m;
    while (i > 0 && j > 0) {
      if (a[i - 1] === b[j - 1]) {
        keep[i - 1] = true;
        i -= 1;
        j -= 1;
      } else if (dp[i - 1][j] >= dp[i][j - 1]) i -= 1;
      else j -= 1;
    }
    return keep;
  };

  const lineSimilarity = (a: string, b: string) => {
    const ta = wordTokens(a);
    const tb = wordTokens(b);
    if (ta.length === 0 && tb.length === 0) return 1;
    if (ta.length === 0 || tb.length === 0) return 0;
    const common = lcsKeep(ta, tb).filter(Boolean).length;
    return (2 * common) / (ta.length + tb.length);
  };

  const alignLines = (current: string[], other: string[]) => {
    const n = current.length;
    const m = other.length;
    const sim = current.map((line) => other.map((candidate) => lineSimilarity(line, candidate)));
    const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
    const choice = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
    for (let i = 1; i <= n; i += 1) {
      for (let j = 1; j <= m; j += 1) {
        let best = dp[i - 1][j];
        let how = 0;
        if (dp[i][j - 1] > best) {
          best = dp[i][j - 1];
          how = 1;
        }
        const score = sim[i - 1][j - 1];
        if (score >= 0.45 && dp[i - 1][j - 1] + score >= best) {
          best = dp[i - 1][j - 1] + score;
          how = 2;
        }
        dp[i][j] = best;
        choice[i][j] = how;
      }
    }
    const mapped: (number | null)[] = Array(n).fill(null);
    let i = n;
    let j = m;
    while (i > 0 && j > 0) {
      const how = choice[i][j];
      if (how === 2) {
        mapped[i - 1] = j - 1;
        i -= 1;
        j -= 1;
      } else if (how === 1) j -= 1;
      else i -= 1;
    }
    return mapped;
  };

  const highlightMask = (current: string, other: string | null) => {
    const mask = Array(current.length).fill(false);
    if (!current.trim()) return mask;
    if (other == null) {
      mask.fill(true);
      return mask;
    }
    const a = tokenSpans(current);
    const b = tokenSpans(other);
    const keep = lcsKeep(a.map((span) => span.key), b.map((span) => span.key));
    a.forEach((span, index) => {
      if (keep[index]) return;
      for (let c = span.start; c < span.end; c += 1) mask[c] = true;
    });
    for (let index = 0; index < a.length - 1; index += 1) {
      if (keep[index] || keep[index + 1]) continue;
      for (let c = a[index].end; c < a[index + 1].start; c += 1) mask[c] = true;
    }
    return mask;
  };

  const masksForLines = (currentLines: string[], otherTexts: string[]) => {
    const masks = currentLines.map((line) => Array(line.length).fill(false));
    otherTexts.forEach((text) => {
      const otherLines = String(text ?? '').replace(/\r\n/g, '\n').split('\n');
      const aligned = alignLines(currentLines, otherLines);
      currentLines.forEach((line, index) => {
        const otherIndex = aligned[index];
        const mask = highlightMask(line, otherIndex == null ? null : otherLines[otherIndex]);
        mask.forEach((on, charIndex) => {
          if (on) masks[index][charIndex] = true;
        });
      });
    });
    return masks;
  };

  const renderMasked = (text: string, mask: boolean[] | null) => {
    if (!text) return '\u00a0';
    if (!mask) return text;
    const nodes: React.ReactNode[] = [];
    let i = 0;
    while (i < text.length) {
      const on = !!mask[i];
      let j = i + 1;
      while (j < text.length && !!mask[j] === on) j += 1;
      const slice = text.slice(i, j);
      nodes.push(on
        ? <Box key={i} component="span" sx={{ color: '#c62828', fontWeight: 700 }}>{slice}</Box>
        : <span key={i}>{slice}</span>);
      i = j;
    }
    return <>{nodes}</>;
  };

  const renderDiffLines = (current: string | undefined, otherTexts: string[]) => {
    const lines = String(current ?? '').replace(/\r\n/g, '\n').split('\n');
    const masks = masksForLines(lines, otherTexts);
    return (
      <>
        {lines.map((line, i) => (
          <Typography key={i} component="div" sx={{ fontSize: 16, whiteSpace: 'pre-wrap', minHeight: '1.4em' }}>
            {line ? renderMasked(line, masks[i]) : '\u00a0'}
          </Typography>
        ))}
      </>
    );
  };

  const renderIngredientColumns = (current: string | undefined, otherTexts: string[] | null, multiplier: number, showAdjusted: boolean, editing: boolean) => {
    const qtyRe = new RegExp(QTY_SRC, 'g');
    const parseLine = (raw: string) => {
      const shown = raw.replace(/^\s*[-*+]\s+/, '');
      qtyRe.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = qtyRe.exec(shown))) {
        if (!shouldScaleQty(shown, match.index, match[0])) continue;
        if (shown.slice(0, match.index).trim()) break;
        const after = shown.slice(match.index + match[0].length);
        const trimmedAfter = after.trimStart();
        const wordMatch = trimmedAfter.match(/^([A-Za-z][A-Za-z.]*)/);
        const word = wordMatch?.[1] ?? '';
        const unit = word && isQtyUnit(word) ? word : '';
        const qtyStart = match.index;
        let qtyEnd = match.index + match[0].length;
        if (unit && wordMatch) {
          qtyEnd = match.index + match[0].length + after.indexOf(wordMatch[1]) + word.length;
        }
        let ingStart = qtyEnd;
        while (ingStart < shown.length && /\s/.test(shown[ingStart])) ingStart += 1;
        const value = parseQtyToken(match[0]);
        const scaled = value == null ? '' : `${formatQty(value * multiplier)}${unit ? ` ${unit}` : ''}`;
        return { shown, original: shown.slice(qtyStart, qtyEnd), ingredient: shown.slice(ingStart), scaled, qtyStart, qtyEnd, ingStart };
      }
      return { shown, original: '', ingredient: shown, scaled: '', qtyStart: 0, qtyEnd: 0, ingStart: 0 };
    };
    const compactLines = (text: string) => String(text ?? '').replace(/\r\n/g, '\n').split('\n').map((line) => line.replace(/^\s*[-*+]\s+/, '').trim()).filter(Boolean).map((line) => (editing ? line : hyphenateMixedFractions(line)));
    const sourceLines = compactLines(String(current ?? ''));
    const lineMasks = otherTexts ? masksForLines(sourceLines, otherTexts.map((text) => compactLines(text).join('\n'))) : null;
    const rows = sourceLines.map((raw) => ({ ...parseLine(raw), raw }));
    if (editing) rows.push({ original: '', scaled: '', ingredient: '', raw: '', shown: '', qtyStart: 0, qtyEnd: 0, ingStart: 0 });

    const writeRow = (index: number, field: 'original' | 'ingredient', value: string) => {
      const next = sourceLines.slice();
      while (next.length <= index) next.push('');
      const parsed = parseLine(next[index] ?? '');
      parsed[field] = value;
      const qty = parsed.original.trim();
      const name = parsed.ingredient.trim();
      next[index] = qty && name ? `${qty} ${name}` : qty || name;
      handleFieldChange('ingredients', next.map((line) => line.trim()).filter(Boolean).join('\n'));
    };

    const fieldStyle = (text: string): React.CSSProperties => ({
      width: `${Math.max(text.length, 1)}ch`,
      maxWidth: '100%',
      border: 'none',
      outline: 'none',
      background: 'transparent',
      font: 'inherit',
      fontSize: 16,
      padding: 0,
      margin: 0,
      color: 'inherit',
    });

    return (
      <Box sx={{ display: 'grid', gridTemplateColumns: showAdjusted ? 'max-content max-content minmax(0, 1fr)' : 'max-content minmax(0, 1fr)', columnGap: '0.6rem', rowGap: 0.25, justifyItems: 'start', alignItems: 'baseline' }}>
        {rows.map((row, i) => {
          const mask = lineMasks?.[i] ?? null;
          const ingredientNode = editing ? (
            <input
              value={row.ingredient}
              onChange={(e) => writeRow(i, 'ingredient', e.target.value)}
              placeholder={i === rows.length - 1 ? 'Ingredient' : ''}
              style={{ ...fieldStyle(row.ingredient || 'Ingredient'), width: '100%' }}
            />
          ) : !row.ingredient ? '\u00a0' : renderMasked(row.ingredient, mask ? mask.slice(row.ingStart, row.ingStart + row.ingredient.length) : null);
          return (
            <Box key={i} sx={{ display: 'contents' }}>
              {showAdjusted && (
                <Box component="div" sx={{ fontSize: 16, color: '#1565c0', fontWeight: 700, whiteSpace: 'nowrap', width: 'max-content' }}>
                  {row.scaled}
                </Box>
              )}
              {editing ? (
                <input
                  value={row.original}
                  onChange={(e) => writeRow(i, 'original', e.target.value)}
                  placeholder="Qty"
                  style={{ ...fieldStyle(row.original || 'Qty'), minWidth: '8ch' }}
                />
              ) : (
                <Box component="div" sx={{ fontSize: 16, whiteSpace: 'nowrap', width: 'max-content' }}>
                  {row.original ? renderMasked(row.original, mask ? mask.slice(row.qtyStart, row.qtyEnd) : null) : ''}
                </Box>
              )}
              <Box component="div" sx={{ fontSize: 16, width: '100%' }}>
                {ingredientNode}
              </Box>
            </Box>
          );
        })}
      </Box>
    );
  };

  if (loading) return <Typography>{t('loadingRecipe')}</Typography>;
  if (error) return <Typography color="error">{t('error')}: {error}</Typography>;
  if (!recipe) return <Typography>{t('recipeNotFound')}</Typography>;

  const resolveImageUrl = (raw: string | undefined): string | null => {
    const u = recipeImageSrc(raw);
    return u ?? null;
  };
  const sharedImage = recipe.imageUrl || versions.find((v) => v.imageUrl)?.imageUrl || '';
  const displayImageUrl = isOwner && isEditing
    ? (imagePreview ?? resolveImageUrl(editFields?.imageUrl || sharedImage) ?? null)
    : resolveImageUrl(sharedImage);
  const hasImageInEdit = !!(editFields?.imageUrl && String(editFields.imageUrl).trim());
  const showDiffs = highlightDiffs && versions.length > 1 && !(isOwner && isEditing);
  const parsedMultiplier = Number(multiplierInput);
  const multiplier = Number.isFinite(parsedMultiplier) && parsedMultiplier > 0 ? parsedMultiplier : 1;
  const scaleIngredients = Math.abs(multiplier - 1) > 0.0001;

  return (
    <Paper sx={{ p: 4, maxWidth: 900, mx: 'auto', width: '100%' }}>
      <Button variant="text" onClick={handleBack} sx={{ mb: 2 }}>&larr; {t('back')}</Button>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(180px, 280px)', gap: 3, alignItems: 'start', mb: 2 }}>
        <Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 1 }}>
            {versions.length > 1 && (
              <Button
                variant={highlightDiffs ? 'contained' : 'outlined'}
                color={highlightDiffs ? 'error' : 'primary'}
                sx={{ borderRadius: '4px !important', textTransform: 'none' }}
                onClick={() => {
                  const next = !highlightDiffs;
                  setHighlightDiffs(next);
                  try { localStorage.setItem('recipeHighlightDiffs', next ? '1' : '0'); } catch { /* ignore */ }
                }}
              >
                {highlightDiffs ? 'Unhighlight' : 'Highlight'}
              </Button>
            )}
            {versions.map((v: Version, idx: number) => (
              <Button
                key={v.id || idx}
                onClick={() => handleSelectVersion(idx)}
                variant={idx === selectedVersionIdx ? 'contained' : 'outlined'}
                sx={{ borderRadius: 999, textTransform: 'none' }}
              >
                {v.name ? v.name : (v.createdAt ? new Date(v.createdAt).toLocaleString() : `${t('version')} ${idx + 1}`)}
              </Button>
            ))}
          </Box>
          {isOwner && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
              {!isEditing ? (
                <Button variant="outlined" onClick={handleEdit} startIcon={<EditIcon />} sx={{ borderRadius: 2, textTransform: 'none' }}>{t('edit', 'Edit')}</Button>
              ) : (
                <Button variant="contained" color="primary" onClick={handleSave} startIcon={<SaveIcon />} sx={{ borderRadius: 2, textTransform: 'none' }}>{t('save', 'Save')}</Button>
              )}
              <Button variant="outlined" onClick={() => { setRenameName(selectedVersion?.name || ''); setRenameError(null); setRenameOpen(true); }} disabled={!selectedVersion?.id} sx={{ borderRadius: 2, textTransform: 'none' }}>Rename</Button>
              <Button variant="outlined" onClick={() => { setNewVariationName(''); setNewVariationOpen(true); }} sx={{ borderRadius: 2, textTransform: 'none' }}>New Variation</Button>
              <Button variant="outlined" color="error" onClick={() => { setDeleteConfirmName(''); setDeleteError(null); setDeleteDialogOpen(true); }} disabled={deleting} startIcon={<DeleteIcon />} sx={{ borderRadius: 2, textTransform: 'none' }}>{t('delete')}</Button>
              {recipe?.sourceUrl && !recipe.validated && (
                <Button variant="outlined" onClick={handleValidate} disabled={validating} startIcon={validating ? <CircularProgress size={16} /> : <VerifiedIcon />} sx={{ borderRadius: 2, textTransform: 'none' }} title="Mark this imported recipe as a Secret Garden recipe. It will no longer update from the original source.">
                  {validating ? 'Validating…' : t('validate', 'Validate')}
                </Button>
              )}
            </Box>
          )}
          {isOwner && validateNotification && (
            <Alert severity="error" sx={{ mt: 1 }} onClose={() => setValidateNotification(null)}>{validateNotification}</Alert>
          )}
        </Box>
        <Box>
          {isOwner && isEditing ? (
            <>
              <Typography variant="subtitle2" gutterBottom>Image</Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1, flexWrap: 'wrap' }}>
                <Button variant="outlined" component="label" size="small">Upload<input type="file" accept="image/*" hidden onChange={handleImageUpload} /></Button>
                {(displayImageUrl || hasImageInEdit) && (
                  <Button variant="outlined" color="error" size="small" onClick={handleDeleteImage}>Delete</Button>
                )}
              </Box>
              <TextField fullWidth size="small" label="Image URL" value={editFields?.imageUrl ?? ''} onChange={e => handleFieldChange('imageUrl', e.target.value)} placeholder="https://example.com/image.jpg" sx={{ mb: 1 }} />
              {uploading && <Typography component="span">Uploading...</Typography>}
              {displayImageUrl && (
                <img src={displayImageUrl} alt={editFields?.title || recipe?.title || ''} style={{ width: '100%', maxHeight: 280, objectFit: 'contain' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              )}
            </>
          ) : (
            displayImageUrl && (
              <img src={displayImageUrl} alt={recipe?.title || ''} style={{ width: '100%', maxHeight: 280, objectFit: 'contain' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            )
          )}
        </Box>
      </Box>
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
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 2, mt: 2 }}>
        <TextField
          size="small"
          label="Multiply"
          type="number"
          value={multiplierInput}
          onChange={(e) => setMultiplierInput(e.target.value)}
          inputProps={{ step: 'any', min: 0 }}
          sx={{ width: 140 }}
        />
        <Typography variant="h6">{t('ingredients')}</Typography>
      </Box>
      <Box sx={{ background: '#f5f5f5', p: 2, borderRadius: 1, overflowX: 'auto' }}>
        {isOwner && isEditing ? (
          renderIngredientColumns(editFields?.ingredients ?? '', null, multiplier, scaleIngredients, true)
        ) : (
          renderIngredientColumns(
            editFields?.ingredients ?? selectedVersion?.ingredients,
            showDiffs ? versions.filter((_, idx) => idx !== selectedVersionIdx).map((v) => v.ingredients || '') : null,
            multiplier,
            scaleIngredients,
            false
          )
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
          <Typography gutterBottom>Name this variation.</Typography>
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
