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
  Paper,
  Snackbar
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
  cookTime?: string;
  difficulty?: string;
  timeReasoning?: string;
  difficultyReasoning?: string;
}

interface ImportJob {
  id: string;
  url: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: ImportedRecipe;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

interface JobStatus {
  jobId: string;
  url: string;
  status: string;
  message: string;
}

const ImportRecipe: React.FC<ImportRecipeProps> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [importedRecipe, setImportedRecipe] = useState<ImportedRecipe | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeJobs, setActiveJobs] = useState<JobStatus[]>([]);
  const [notification, setNotification] = useState<string | null>(null);

  // Poll for job status for all active jobs
  useEffect(() => {
    if (activeJobs.length === 0) return;

    const pollInterval = setInterval(async () => {
      const updatedJobs = await Promise.all(
        activeJobs.map(async (jobStatus) => {
          try {
            const response = await fetch(`/api/imports/status/${jobStatus.jobId}`, {
              credentials: 'include',
            });

            if (response.ok) {
              const job: ImportJob = await response.json();
              
              if (job.status === 'completed' && job.result) {
                setImportedRecipe(job.result);
                setNotification(`Recipe "${job.result.title}" imported successfully!`);
                return null; // Remove from active jobs
              } else if (job.status === 'failed') {
                setError(`Import failed for ${jobStatus.url}: ${job.error || 'Unknown error'}`);
                return null; // Remove from active jobs
              } else {
                return {
                  ...jobStatus,
                  status: job.status,
                  message: job.status === 'pending' ? 'Queued and waiting...' : 
                          job.status === 'processing' ? 'Processing recipe...' : job.status
                };
              }
            }
            return jobStatus;
          } catch (err) {
            console.error('Error polling job status:', err);
            return jobStatus;
          }
        })
      );

      // Remove completed/failed jobs and update active jobs
      const remainingJobs = updatedJobs.filter(job => job !== null) as JobStatus[];
      setActiveJobs(remainingJobs);
      
      // Stop polling if no active jobs
      if (remainingJobs.length === 0) {
        clearInterval(pollInterval);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [activeJobs]);

  const handleImport = async () => {
    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }

    setError(null);
    setImportedRecipe(null);

    try {
      const response = await fetch('/api/imports/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: url.trim() }),
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start import');
      }

      const data = await response.json();
      
      // Add new job to active jobs
      const newJob: JobStatus = {
        jobId: data.jobId,
        url: url.trim(),
        status: data.status,
        message: 'Queued and waiting...'
      };
      setActiveJobs(prev => [...prev, newJob]);
      
      setNotification('Import job started! You can continue adding more URLs.');
      // Clear the URL field to allow entering another URL
      setUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start import');
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
    setSaving(false);
    setActiveJobs([]);
    setNotification(null);
    onClose();
  };

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setUrl('');
      setError(null);
      setImportedRecipe(null);
      setSaving(false);
      setActiveJobs([]);
      setNotification(null);
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
            sx={{ mb: 2 }}
          />
          <Button
            variant="contained"
            onClick={handleImport}
            disabled={!url.trim()}
          >
            {t('import', 'Import')}
          </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {activeJobs.length > 0 && (
          <Box sx={{ maxHeight: 200, overflowY: 'auto', mb: 2 }}>
            {activeJobs.map((job) => (
              <Alert key={job.jobId} severity="info" sx={{ mb: 1 }}>
                <Typography variant="body2" fontWeight="bold">
                  {job.url.length > 50 ? job.url.substring(0, 47) + '...' : job.url}
                </Typography>
                <Typography variant="body2">
                  Status: {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {job.message}
                </Typography>
              </Alert>
            ))}
          </Box>
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

            {(importedRecipe.cookTime || importedRecipe.difficulty) && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                  Recipe Details:
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  {importedRecipe.cookTime && (
                    <Box>
                      <Typography variant="body2" fontWeight="bold">
                        Cook Time: {(() => {
                          const minutes = parseInt(importedRecipe.cookTime);
                          if (minutes >= 60) {
                            const hours = Math.floor(minutes / 60);
                            const remainingMins = minutes % 60;
                            if (remainingMins === 0) {
                              return `${hours}h`;
                            } else {
                              return `${hours}h ${remainingMins}m`;
                            }
                          } else {
                            return `${minutes}m`;
                          }
                        })()}
                      </Typography>
                      {importedRecipe.timeReasoning && (
                        <Typography variant="caption" color="text.secondary">
                          {importedRecipe.timeReasoning}
                        </Typography>
                      )}
                    </Box>
                  )}
                  {importedRecipe.difficulty && (
                    <Box>
                      <Typography variant="body2" fontWeight="bold">
                        Difficulty: {importedRecipe.difficulty}
                      </Typography>
                      {importedRecipe.difficultyReasoning && (
                        <Typography variant="caption" color="text.secondary">
                          {importedRecipe.difficultyReasoning}
                        </Typography>
                      )}
                    </Box>
                  )}
                </Box>
              </Box>
            )}

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
        <Button onClick={handleClose}>
          {t('close', 'Close')}
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
      
      <Snackbar
        open={!!notification}
        autoHideDuration={6000}
        onClose={() => setNotification(null)}
        message={notification}
      />
    </Dialog>
  );
};

export default ImportRecipe; 