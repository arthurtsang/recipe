import React, { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions, 
  TextField, 
  Button, 
  Typography, 
  Box, 
  CircularProgress,
  Alert,
  Paper
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

interface ImportRecipeProps {
  open: boolean;
  onClose: () => void;
}

interface ImportedRecipe {
  title: string;
  description: string;
  ingredients: string;
  instructions: string;
  imageUrl: string;
  tags: string[];
}

const ImportRecipe: React.FC<ImportRecipeProps> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importedRecipe, setImportedRecipe] = useState<ImportedRecipe | null>(null);
  const [saving, setSaving] = useState(false);

  const handleImport = async () => {
    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }

    setLoading(true);
    setError(null);
    setImportedRecipe(null);

    try {
      const response = await fetch('/api/recipes/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: url.trim() }),
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to import recipe');
      }

      const data = await response.json();
      setImportedRecipe(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import recipe');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!importedRecipe) return;

    setSaving(true);
    try {
      const response = await fetch('/api/recipes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: importedRecipe.title,
          description: importedRecipe.description,
          ingredients: importedRecipe.ingredients,
          instructions: importedRecipe.instructions,
          imageUrl: importedRecipe.imageUrl,
        }),
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save recipe');
      }

      const data = await response.json();
      onClose();
      navigate(`/recipes/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save recipe');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setUrl('');
    setError(null);
    setImportedRecipe(null);
    setLoading(false);
    setSaving(false);
    onClose();
  };

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setUrl('');
      setError(null);
      setImportedRecipe(null);
      setLoading(false);
      setSaving(false);
    }
  }, [open]);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>{t('importRecipe', 'Import Recipe')}</DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('importRecipeDescription', 'Enter a recipe URL to import. We\'ll extract the recipe information using AI.')}
          </Typography>
          <TextField
            fullWidth
            label={t('recipeUrl', 'Recipe URL')}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://myrecipe.kitchen/..."
            disabled={loading}
            sx={{ mb: 2 }}
          />
          <Button
            variant="contained"
            onClick={handleImport}
            disabled={loading || !url.trim()}
            startIcon={loading ? <CircularProgress size={20} /> : null}
          >
            {loading ? t('importing', 'Importing...') : t('import', 'Import')}
          </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {importedRecipe && (
          <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
            <Typography variant="h6" gutterBottom>
              {t('importedRecipe', 'Imported Recipe')}
            </Typography>
            
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle1" fontWeight="bold">
                {importedRecipe.title}
              </Typography>
              {importedRecipe.description && (
                <Typography variant="body2" color="text.secondary">
                  {importedRecipe.description}
                </Typography>
              )}
            </Box>

            {importedRecipe.imageUrl && (
              <Box sx={{ mb: 2, textAlign: 'center' }}>
                <img
                  src={
                    importedRecipe.imageUrl.startsWith('http') 
                      ? `/api/recipes/proxy-image?url=${encodeURIComponent(importedRecipe.imageUrl)}`
                      : importedRecipe.imageUrl
                  }
                  alt={importedRecipe.title}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '200px',
                    borderRadius: '8px',
                  }}
                  onError={(e) => {
                    console.warn('Failed to load image:', importedRecipe.imageUrl);
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </Box>
            )}

            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                {t('ingredients', 'Ingredients')}:
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                {importedRecipe.ingredients}
              </Typography>
            </Box>

            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                {t('instructions', 'Instructions')}:
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                {importedRecipe.instructions}
              </Typography>
            </Box>

            {importedRecipe.tags && importedRecipe.tags.length > 0 && (
              <Box>
                <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                  {t('tags', 'Tags')}:
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {importedRecipe.tags.map((tag, index) => (
                    <Typography
                      key={index}
                      variant="caption"
                      sx={{
                        bgcolor: 'primary.main',
                        color: 'white',
                        px: 1,
                        py: 0.5,
                        borderRadius: 1,
                      }}
                    >
                      {tag}
                    </Typography>
                  ))}
                </Box>
              </Box>
            )}
          </Paper>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={saving}>
          {t('cancel', 'Cancel')}
        </Button>
        {importedRecipe && (
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={saving}
            startIcon={saving ? <CircularProgress size={20} /> : null}
          >
            {saving ? t('saving', 'Saving...') : t('saveRecipe', 'Save Recipe')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ImportRecipe; 