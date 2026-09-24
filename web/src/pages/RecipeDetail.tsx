import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import { Paper, Typography, Box, Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions, List, ListItem, ListItemButton, ListItemText, Checkbox, FormControlLabel, Rating, Alert, Slide, Link, CircularProgress, Chip } from '@mui/material';
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
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [versionName, setVersionName] = useState<string>(new Date().toLocaleString());
  const [createNewVersion, setCreateNewVersion] = useState(true);
  const [averageRating, setAverageRating] = useState<number | null>(null);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [originalFields, setOriginalFields] = useState<Version | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validateNotification, setValidateNotification] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
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

  const handleOpenSaveDialog = () => {
    setVersionName(new Date().toLocaleString());
    setCreateNewVersion(true);
    setSaveDialogOpen(true);
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
    setSaveDialogOpen(false);
    if (!editFields) return;
    try {
      const payload = createNewVersion
        ? { ...editFields, versionName, createNewVersion: true, cookTime: recipe?.estimatedTime, difficulty: recipe?.difficulty }
        : { ...editFields, createNewVersion: false, versionId: selectedVersion.id, cookTime: recipe?.estimatedTime, difficulty: recipe?.difficulty };
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
      if (createNewVersion && vers.length > 0 && data.currentVersionId) {
        const idx = vers.findIndex((v: any) => v.id === data.currentVersionId);
        newIdx = idx >= 0 ? idx : vers.length - 1;
      } else if (!createNewVersion && selectedVersion.id && vers.length > 0) {
        newIdx = vers.findIndex((v: any) => v.id === selectedVersion.id);
        if (newIdx === -1) newIdx = 0;
      } else if (vers.length > 0) {
        newIdx = vers.length - 1;
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

  const handleDelete = async (deleteWholeRecipe = false) => {
    setDeleteDialogOpen(false);
    if (!id) return;
    setDeleting(true);
    try {
      if (deleteWholeRecipe) {
        const res = await fetch(`/api/recipes/${id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) throw new Error('Failed to delete recipe');
        navigate('/');
        return;
      }
      if (!selectedVersion?.id) return;
      const res = await fetch(`/api/recipes/${id}/versions/${selectedVersion.id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to delete version');
      const recipeRes = await fetch(`/api/recipes/${id}`);
      const data = await recipeRes.json();
      setRecipe(data);
      setSelectedVersionIdx(0);
      const firstVer = data.versions?.[0];
      setEditFields(firstVer ? { ...firstVer, title: data.title, description: data.description, imageUrl: firstVer.imageUrl ?? data.imageUrl ?? '' } : null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
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
        ) : (
          renderMarkdownWithBlankLines(editFields?.ingredients ?? selectedVersion?.ingredients ?? '')
        )}
      </Box>
      <Typography variant="h6" mt={2}>{t('instructions')}</Typography>
      <Box sx={{ background: '#f5f5f5', p: 2, borderRadius: 1, '& p': { margin: '0.25em 0' }, '& ul, & ol': { margin: '0.25em 0', pl: 2 } }}>
        {isOwner && isEditing ? (
          <TextField value={editFields?.instructions || ''} onChange={e => handleFieldChange('instructions', e.target.value)} variant="standard" fullWidth multiline minRows={6} placeholder="One step per line or use markdown." InputProps={{ disableUnderline: true, style: { fontFamily: 'inherit', fontSize: 16 } }} />
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
          <Box sx={{ mt: 1 }}>
            <Typography variant="body2" component="span" color="text.secondary">Source: {' '}</Typography>
            <Link href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer" sx={{ color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
              {recipe.sourceUrl}
            </Link>
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
              <Button variant="contained" color="primary" onClick={handleOpenSaveDialog} startIcon={<SaveIcon />}>{t('save', 'Save')}</Button>
            )}
            {recipe?.sourceUrl && !recipe.validated && (
              <Button variant="outlined" size="medium" onClick={handleValidate} disabled={validating} startIcon={validating ? <CircularProgress size={16} /> : <VerifiedIcon />} title="Mark this imported recipe as a Secret Garden recipe. It will no longer update from the original source.">
                {validating ? 'Validating…' : t('validate', 'Validate')}
              </Button>
            )}
            <Button variant="outlined" color="error" onClick={() => setDeleteDialogOpen(true)} disabled={deleting} startIcon={<DeleteIcon />}>{t('delete')}</Button>
          </Box>
        </Box>
      )}
      <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)}>
        <DialogTitle>{t('saveRecipe')}</DialogTitle>
        <DialogContent>
          <FormControlLabel control={<Checkbox checked={createNewVersion} onChange={e => setCreateNewVersion(e.target.checked)} />} label={t('createNewVersion')} />
          {createNewVersion && (
            <>
              <Typography gutterBottom>{t('enterVersionName')}</Typography>
              <TextField autoFocus margin="dense" label={t('versionName')} type="text" fullWidth value={versionName} onChange={e => setVersionName(e.target.value)} />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveDialogOpen(false)}>{t('cancel')}</Button>
          <Button onClick={handleSave} variant="contained">{t('save')}</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>{t('delete')}</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>{t('deleteVersionOrRecipe')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>{t('cancel')}</Button>
          <Button onClick={() => handleDelete(false)} color="error" variant="contained">{t('deleteVersion')}</Button>
          <Button onClick={() => handleDelete(true)} color="error" variant="outlined">{t('deleteRecipe')}</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default RecipeDetail;
