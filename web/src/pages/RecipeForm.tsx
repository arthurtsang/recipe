import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, Typography, TextField, Button, Paper } from '@mui/material';
import { useTranslation } from 'react-i18next';

interface User {
  id: string;
  name?: string;
  email: string;
  picture?: string;
}

const RecipeForm: React.FC<{ user: User | null }> = ({ user }) => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [instructions, setInstructions] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isEdit && id) {
      setLoading(true);
      fetch(`/api/recipes/${id}`)
        .then(res => {
          if (!res.ok) throw new Error('Failed to fetch');
          return res.json();
        })
        .then(data => {
          setTitle(data.title || '');
          setDescription(data.description || '');
          setIngredients(data.versions?.[0]?.ingredients || '');
          setInstructions(data.versions?.[0]?.instructions || '');
          setImageUrl(data.imageUrl || '');
        })
        .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
        .finally(() => setLoading(false));
    }
  }, [isEdit, id]);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImagePreview(URL.createObjectURL(file));
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('/api/recipes/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to upload image');
      setImageUrl(data.url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const method = isEdit ? 'PUT' : 'POST';
      const url = isEdit ? `/api/recipes/${id}` : '/api/recipes';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, ingredients, instructions, imageUrl }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to save recipe');
      const data = await res.json();
      navigate(`/recipes/${isEdit ? id : data.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <Paper sx={{ p: 4, maxWidth: 600, mx: 'auto', width: '100%' }}>
        <Typography variant="h6" align="center">{t('mustBeLoggedIn')}</Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 4, maxWidth: 600, mx: 'auto', width: '100%' }}>
      <Typography variant="h5" gutterBottom sx={{ textAlign: 'center', mb: 2 }}>{isEdit ? t('editRecipe') : t('addRecipe')}</Typography>
      <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField
          label="Title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          required
        />
        <TextField
          label="Description"
          value={description}
          onChange={e => setDescription(e.target.value)}
          multiline
        />
        <TextField
          label="Ingredients"
          value={ingredients}
          onChange={e => setIngredients(e.target.value)}
          multiline
          required
        />
        <TextField
          label="Instructions"
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          multiline
          required
        />
        <Box>
          <Typography variant="subtitle2" gutterBottom>
            Image (Upload file or enter URL)
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 1 }}>
            <Button variant="outlined" component="label">
              Upload Image File
              <input type="file" accept="image/*" hidden onChange={handleImageChange} />
            </Button>
            <Typography variant="body2" color="text.secondary">or</Typography>
          </Box>
          <TextField
            fullWidth
            label="Image URL"
            value={imageUrl}
            onChange={e => setImageUrl(e.target.value)}
            placeholder="https://example.com/image.jpg"
            helperText="Enter a direct link to an image"
          />
          {uploading && <Typography sx={{ mt: 1 }} component="span">Uploading...</Typography>}
          {(imagePreview || imageUrl) && (
            <Box mt={2}>
              <img 
                src={imagePreview || imageUrl} 
                alt="Preview" 
                style={{ maxWidth: 200, maxHeight: 200, objectFit: 'contain' }} 
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </Box>
          )}
        </Box>
        <Button type="submit" variant="contained" disabled={loading}>{isEdit ? 'Update' : 'Submit'}</Button>
        {loading && <Typography>Submitting...</Typography>}
        {error && <Typography color="error">Error: {error}</Typography>}
      </Box>
    </Paper>
  );
};

export default RecipeForm;
