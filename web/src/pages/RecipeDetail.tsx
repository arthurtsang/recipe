import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Paper, Typography, Box, Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions, List, ListItem, ListItemButton, ListItemText, Checkbox, FormControlLabel, Rating } from '@mui/material';

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
  name?: string; // Added for version name
}

interface Recipe {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  user: { id: string; name?: string; email: string };
  versions: Version[];
}

const RecipeDetail: React.FC<{ user: User | null }> = ({ user }) => {
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
        setSelectedVersionIdx(0);
        if (data.versions && data.versions.length > 0) {
          setEditFields({ ...data.versions[0], title: data.title, description: data.description, imageUrl: data.imageUrl });
        }
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [id]);

  // Fetch ratings
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

  const isOwner = user && recipe && recipe.user && user.id === recipe.user.id;
  const versions = recipe?.versions || [];
  const selectedVersion = versions[selectedVersionIdx] || {};

  // Handle version selection
  const handleSelectVersion = (idx: number) => {
    setSelectedVersionIdx(idx);
    if (!recipe) return;
    setEditFields({ ...versions[idx], title: recipe.title, description: recipe.description, imageUrl: recipe.imageUrl });
  };

  // Handle field changes
  const handleFieldChange = (field: keyof Version, value: string) => {
    setEditFields(prev => prev ? { ...prev, [field]: value } : null);
  };

  // Open save dialog and set default version name
  const handleOpenSaveDialog = () => {
    setVersionName(new Date().toLocaleString());
    setCreateNewVersion(true);
    setSaveDialogOpen(true);
  };

  // Save (create new version or update current)
  const handleSave = async () => {
    setSaveDialogOpen(false);
    if (!editFields) return;
    try {
      const payload = createNewVersion
        ? { ...editFields, versionName, createNewVersion: true }
        : { ...editFields, createNewVersion: false, versionId: selectedVersion.id };
      const res = await fetch(`/api/recipes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to save');
      const data = await res.json();
      setRecipe(data);
      // Find the new/updated version index
      let newIdx = 0;
      if (!createNewVersion && selectedVersion.id) {
        newIdx = data.versions.findIndex((v: any) => v.id === selectedVersion.id);
      } else if (createNewVersion && data.versions.length > 0) {
        newIdx = 0; // Assume new version is first
      }
      setSelectedVersionIdx(newIdx);
      setEditFields({ ...data.versions[newIdx], title: data.title, description: data.description, imageUrl: data.imageUrl });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // Handle rating change
  const handleRatingChange = async (_event: any, newValue: number | null) => {
    if (!newValue) return;
    setUserRating(newValue);
    await fetch(`/api/recipes/${id}/ratings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ value: newValue }),
    })
      .then(res => res.json())
      .then(data => {
        setAverageRating(data.average);
        setUserRating(data.user);
      });
  };

  // Delete selected version or whole recipe
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
      // Refetch recipe
      const recipeRes = await fetch(`/api/recipes/${id}`);
      const data = await recipeRes.json();
      setRecipe(data);
      setSelectedVersionIdx(0);
      setEditFields(data.versions && data.versions[0] ? { ...data.versions[0], title: data.title, description: data.description, imageUrl: data.imageUrl } : null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <Typography>Loading recipe...</Typography>;
  if (error) return <Typography color="error">Error: {error}</Typography>;
  if (!recipe) return <Typography>Recipe not found.</Typography>;

  // Fix image URL if it's a relative path
  let imageUrl = editFields?.imageUrl || recipe?.imageUrl;
  if (imageUrl && imageUrl.startsWith('/uploads/')) {
    imageUrl = `${window.location.origin}${imageUrl}`;
  }

  return (
    <Paper sx={{ p: 4, maxWidth: 700, mx: 'auto' }}>
      <Button variant="text" onClick={handleBack} sx={{ mb: 2 }}>&larr; Back</Button>
      <Typography variant="h4" gutterBottom>
        {isOwner ? (
          <TextField
            value={editFields?.title || ''}
            onChange={e => handleFieldChange('title', e.target.value)}
            variant="standard"
            fullWidth
            InputProps={{ disableUnderline: true, style: { fontSize: 32, fontWeight: 600 } }}
          />
        ) : (
          recipe?.title || ''
        )}
      </Typography>
      {/* Star Rating UI */}
      <Box display="flex" alignItems="center" mb={2}>
        <Rating
          name="user-rating"
          value={userRating}
          onChange={handleRatingChange}
          size="large"
        />
        <Typography variant="body2" sx={{ ml: 2 }}>
          {averageRating ? `Average: ${averageRating.toFixed(2)} / 5` : 'No ratings yet'}
        </Typography>
      </Box>
      {imageUrl && <Box mb={2}><img src={imageUrl} alt={editFields?.title || recipe?.title || ''} style={{ maxWidth: 400, width: '100%' }} /></Box>}
      <Typography variant="subtitle1" color="text.secondary" gutterBottom>
        {isOwner ? (
          <TextField
            value={editFields?.description || ''}
            onChange={e => handleFieldChange('description', e.target.value)}
            variant="standard"
            fullWidth
            multiline
            InputProps={{ disableUnderline: true, style: { fontSize: 18 } }}
          />
        ) : (
          selectedVersion.description
        )}
      </Typography>
      <Typography variant="h6" mt={2}>Ingredients</Typography>
      <Box component="pre" sx={{ background: '#f5f5f5', p: 2, borderRadius: 1, overflowX: 'auto' }}>
        {isOwner ? (
          <TextField
            value={editFields?.ingredients || ''}
            onChange={e => handleFieldChange('ingredients', e.target.value)}
            variant="standard"
            fullWidth
            multiline
            InputProps={{ disableUnderline: true, style: { fontFamily: 'inherit', fontSize: 16 } }}
          />
        ) : (
          selectedVersion.ingredients
        )}
      </Box>
      <Typography variant="h6" mt={2}>Instructions</Typography>
      <Box component="pre" sx={{ background: '#f5f5f5', p: 2, borderRadius: 1, overflowX: 'auto' }}>
        {isOwner ? (
          <TextField
            value={editFields?.instructions || ''}
            onChange={e => handleFieldChange('instructions', e.target.value)}
            variant="standard"
            fullWidth
            multiline
            InputProps={{ disableUnderline: true, style: { fontFamily: 'inherit', fontSize: 16 } }}
          />
        ) : (
          selectedVersion.instructions
        )}
      </Box>
      <Box sx={{ fontSize: '0.9em', color: 'text.secondary', mt: 2 }}>
        By: {recipe.user?.name || recipe.user?.email}
      </Box>
      {/* Versions List */}
      {versions.length > 1 && (
        <Box mt={3} mb={2} sx={{ position: 'relative' }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Versions:</Typography>
          <Box sx={{ position: 'relative', overflowX: 'auto', maxWidth: '100%' }}>
            <List dense sx={{ display: 'flex', flexDirection: 'row', gap: 1, p: 0, minHeight: 48 }}>
              {versions.map((v: Version, idx: number) => (
                <ListItem key={v.id || idx} disablePadding sx={{ width: 'auto', minWidth: 120 }}>
                  <ListItemButton selected={idx === selectedVersionIdx} onClick={() => handleSelectVersion(idx)}>
                    <ListItemText primary={v.name ? v.name : (v.createdAt ? new Date(v.createdAt).toLocaleString() : `Version ${idx + 1}`)} />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
            <Box sx={{ position: 'absolute', top: 0, right: 0, width: 32, height: '100%', pointerEvents: 'none', background: 'linear-gradient(to left, #fff, rgba(255,255,255,0))' }} />
          </Box>
        </Box>
      )}
      {/* Owner controls */}
      {isOwner && (
        <Box mt={3} display="flex" gap={2}>
          <Button variant="contained" color="primary" onClick={handleOpenSaveDialog}>Save</Button>
          <Button variant="outlined" color="error" onClick={() => setDeleteDialogOpen(true)} disabled={deleting}>Delete</Button>
        </Box>
      )}
      {/* Save Dialog */}
      <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)}>
        <DialogTitle>Save Recipe</DialogTitle>
        <DialogContent>
          <FormControlLabel
            control={<Checkbox checked={createNewVersion} onChange={e => setCreateNewVersion(e.target.checked)} />}
            label="Create new version (recommended)"
          />
          {createNewVersion && (
            <>
              <Typography gutterBottom>Enter a name for this version:</Typography>
              <TextField
                autoFocus
                margin="dense"
                label="Version Name"
                type="text"
                fullWidth
                value={versionName}
                onChange={e => setVersionName(e.target.value)}
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>
      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>Do you want to delete just this version, or the entire recipe?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={() => handleDelete(false)} color="error" variant="contained">Delete Version</Button>
          <Button onClick={() => handleDelete(true)} color="error" variant="outlined">Delete Recipe</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default RecipeDetail;
