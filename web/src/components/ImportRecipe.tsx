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
import { recipeImageSrc } from '../utils/recipeImageSrc';

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
  const [urlsText, setUrlsText] = useState(''); // For bulk paste
  const [importMode, setImportMode] = useState<'single' | 'bulk'>('single');
  const [error, setError] = useState<string | null>(null);
  const [importedRecipes, setImportedRecipes] = useState<Map<string, { recipe: ImportedRecipe; sourceUrl: string }>>(new Map()); // Track multiple imported recipes
  const [saving, setSaving] = useState(false);
  const [savingRecipeId, setSavingRecipeId] = useState<string | null>(null);
  const [activeJobs, setActiveJobs] = useState<JobStatus[]>([]);
  const [notification, setNotification] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const jobFromStartResponse = (
    data: {
      jobId?: string;
      status?: string;
      jobIds?: string[];
      jobs?: Array<{ jobId?: string; status?: string }>;
    },
    sourceUrl: string
  ): JobStatus | null => {
    const jobId = data.jobs?.[0]?.jobId || data.jobIds?.[0] || data.jobId;
    if (!jobId) return null;
    return {
      jobId,
      url: sourceUrl,
      status: data.jobs?.[0]?.status || data.status || 'pending',
      message: 'Queued and waiting...',
    };
  };

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
                // Store the imported recipe with its source URL
                setImportedRecipes(prev => {
                  const newMap = new Map(prev);
                  newMap.set(job.id, { recipe: job.result!, sourceUrl: job.url });
                  return newMap;
                });
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

  const parseUrls = (text: string): string[] => {
    // Split by newlines first, then by commas, then filter and clean
    // This handles both newline-separated and comma-separated URLs
    const lines = text.split(/\n/).map(line => line.trim()).filter(line => line.length > 0);
    const urls: string[] = [];
    
    for (const line of lines) {
      // If line contains commas, split by comma
      if (line.includes(',')) {
        const commaUrls = line.split(',').map(u => u.trim()).filter(u => u.length > 0);
        urls.push(...commaUrls);
      } else {
        urls.push(line);
      }
    }
    
    // Filter to only valid HTTP/HTTPS URLs
    return urls.filter(u => u.startsWith('http://') || u.startsWith('https://'));
  };

  const handleImport = async () => {
    let urlsToImport: string[] = [];

    if (importMode === 'bulk') {
      urlsToImport = parseUrls(urlsText);
      console.log('Bulk mode - parsed URLs:', urlsToImport);
      console.log('Original text:', urlsText);
      if (urlsToImport.length === 0) {
        setError('Please enter at least one valid URL (one per line or comma-separated)');
        return;
      }
    } else {
      if (!url.trim()) {
        setError('Please enter a URL');
        return;
      }
      urlsToImport = [url.trim()];
    }

    setError(null);
    setSubmitting(true);

    try {
      // For bulk imports, call the single URL API multiple times
      if (urlsToImport.length > 1) {
        console.log(`Starting ${urlsToImport.length} import jobs...`);
        
        // Start all imports in parallel
        const importPromises = urlsToImport.map(async (url) => {
          try {
            const response = await fetch('/api/imports/start', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ url }),
              credentials: 'include',
            });

            if (!response.ok) {
              let errorMessage = 'Failed to start import';
              try {
                const text = await response.text();
                if (text) {
                  const errorData = JSON.parse(text);
                  errorMessage = errorData.error || errorMessage;
                } else {
                  errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                }
              } catch (e) {
                errorMessage = `HTTP ${response.status}: ${response.statusText}`;
              }
              throw new Error(errorMessage);
            }

            const text = await response.text();
            if (!text) {
              throw new Error('Empty response from server');
            }
            const data = JSON.parse(text);
            const job = jobFromStartResponse(data, url);
            if (!job) {
              throw new Error('Server did not return a job id');
            }
            return job;
          } catch (err) {
            console.error(`Failed to start import for ${url}:`, err);
            return {
              jobId: '',
              url: url,
              status: 'failed',
              message: err instanceof Error ? err.message : 'Failed to start import'
            };
          }
        });

        const results = await Promise.all(importPromises);
        
        // Add successful jobs to active jobs
        const successfulJobs = results.filter(job => job.jobId && job.status !== 'failed');
        const failedJobs = results.filter(job => !job.jobId || job.status === 'failed');
        
        if (successfulJobs.length > 0) {
          setActiveJobs(prev => [...prev, ...successfulJobs]);
        }
        
        if (failedJobs.length > 0) {
          setError(`${failedJobs.length} of ${urlsToImport.length} imports failed to start. Check individual job status.`);
        }
        
        if (successfulJobs.length > 0) {
          setNotification(`${successfulJobs.length} import job${successfulJobs.length > 1 ? 's' : ''} started!`);
          setUrl('');
          setUrlsText('');
          onClose();
        }
      } else {
        // Single URL import
        const response = await fetch('/api/imports/start', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url: urlsToImport[0] }),
          credentials: 'include',
        });

        if (!response.ok) {
          let errorMessage = 'Failed to start import';
          try {
            const text = await response.text();
            if (text) {
              const errorData = JSON.parse(text);
              errorMessage = errorData.error || errorMessage;
            } else {
              errorMessage = `HTTP ${response.status}: ${response.statusText}`;
            }
          } catch (e) {
            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          }
          throw new Error(errorMessage);
        }

        const text = await response.text();
        if (!text) {
          throw new Error('Empty response from server');
        }
        const data = JSON.parse(text);
        const newJob = jobFromStartResponse(data, urlsToImport[0]);
        if (!newJob) {
          throw new Error('Server did not return a job id');
        }
        setActiveJobs(prev => [...prev, newJob]);
        setNotification('Import queued — check Import History for progress.');
        setUrl('');
        setUrlsText('');
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start import');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSave = async (jobId: string) => {
    const imported = importedRecipes.get(jobId);
    if (!imported) return;

    setSavingRecipeId(jobId);
    setSaving(true);
    try {
      const response = await fetch('/api/recipes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: imported.recipe.title,
          description: imported.recipe.description,
          ingredients: imported.recipe.ingredients,
          instructions: imported.recipe.instructions,
          imageUrl: imported.recipe.imageUrl,
          sourceUrl: imported.sourceUrl, // Include original URL
          cookTime: imported.recipe.cookTime,
          difficulty: imported.recipe.difficulty,
          timeReasoning: imported.recipe.timeReasoning,
          difficultyReasoning: imported.recipe.difficultyReasoning,
        }),
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save recipe');
      }

      const data = await response.json();
      
      // Remove from imported recipes
      setImportedRecipes(prev => {
        const newMap = new Map(prev);
        newMap.delete(jobId);
        return newMap;
      });
      
      setNotification(`Recipe "${imported.recipe.title}" saved successfully!`);
      
      // If this was the last recipe and dialog should close
      if (importedRecipes.size === 1 && activeJobs.length === 0) {
        setTimeout(() => {
          onClose();
          navigate(`/recipes/${data.id}`);
        }, 1000);
      } else {
        navigate(`/recipes/${data.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save recipe');
    } finally {
      setSaving(false);
      setSavingRecipeId(null);
    }
  };

  const handleClose = () => {
    setUrl('');
    setUrlsText('');
    setError(null);
    setImportedRecipes(new Map());
    setSaving(false);
    setSavingRecipeId(null);
    setActiveJobs([]);
    setNotification(null);
    setImportMode('single');
    onClose();
  };

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setUrl('');
      setUrlsText('');
      setError(null);
      setImportedRecipes(new Map());
      setSaving(false);
      setSavingRecipeId(null);
      setActiveJobs([]);
      setNotification(null);
      setImportMode('single');
    }
  }, [open]);

  return (
    <>
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>{t('importRecipe', 'Import Recipe')}</DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('importRecipeDescription', 'Enter a recipe URL to import. We\'ll extract the recipe information using AI.')}
          </Typography>
          
          {/* Import Mode Toggle */}
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <Button
              variant={importMode === 'single' ? 'contained' : 'outlined'}
              onClick={() => setImportMode('single')}
              size="small"
            >
              Single URL
            </Button>
            <Button
              variant={importMode === 'bulk' ? 'contained' : 'outlined'}
              onClick={() => setImportMode('bulk')}
              size="small"
            >
              Bulk Import
            </Button>
          </Box>

          {importMode === 'single' ? (
            <>
              <TextField
                fullWidth
                label={t('recipeUrl', 'Recipe URL')}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://myrecipe.kitchen/..."
                sx={{ mb: 2 }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && url.trim()) {
                    handleImport();
                  }
                }}
              />
              <Button
                variant="contained"
                onClick={handleImport}
                disabled={!url.trim() || submitting}
                startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : null}
              >
                {submitting ? 'Queuing…' : t('import', 'Import')}
              </Button>
            </>
          ) : (
            <>
              <TextField
                fullWidth
                multiline
                rows={8}
                label="Recipe URLs (one per line or comma-separated)"
                value={urlsText}
                onChange={(e) => setUrlsText(e.target.value)}
                placeholder="https://myrecipe.kitchen/recipe1&#10;https://allrecipes.com/recipe2&#10;https://..."
                sx={{ mb: 2 }}
              />
              <Button
                variant="contained"
                onClick={handleImport}
                disabled={!urlsText.trim() || submitting}
                startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : null}
              >
                {submitting
                  ? 'Queuing…'
                  : `Import All (${parseUrls(urlsText).length} URLs)`}
              </Button>
              {urlsText.trim() && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  Parsed URLs: {parseUrls(urlsText).join(', ')}
                </Typography>
              )}
            </>
          )}
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {activeJobs.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
              Active Imports ({activeJobs.length})
            </Typography>
            <Box sx={{ maxHeight: 300, overflowY: 'auto' }}>
              {activeJobs.map((job) => (
                <Alert key={job.jobId || job.url} severity="info" sx={{ mb: 1 }}>
                  <Typography variant="body2" fontWeight="bold">
                    {job.url.length > 60 ? job.url.substring(0, 57) + '...' : job.url}
                  </Typography>
                  <Typography variant="body2">
                    Status: {(job.status || 'pending').charAt(0).toUpperCase() +
                      (job.status || 'pending').slice(1)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {job.message}
                  </Typography>
                </Alert>
              ))}
            </Box>
          </Box>
        )}

        {importedRecipes.size > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
              Imported Recipes ({importedRecipes.size})
            </Typography>
            <Box sx={{ maxHeight: 400, overflowY: 'auto' }}>
              {Array.from(importedRecipes.entries()).map(([jobId, { recipe }]) => (
                <Paper key={jobId} sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}>
                  <Typography variant="h6" gutterBottom>
                    {recipe.title}
                  </Typography>
                  
                  {recipe.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {recipe.description}
                    </Typography>
                  )}

                  {recipe.imageUrl && (
                    <Box sx={{ mb: 2, textAlign: 'center' }}>
                      <img
                        src={
                          recipe.imageUrl
                            ? recipeImageSrc(recipe.imageUrl) ?? ''
                            : ''
                        }
                        alt={recipe.title}
                        style={{
                          maxWidth: '100%',
                          maxHeight: '150px',
                          borderRadius: '8px',
                        }}
                        onError={(e) => {
                          console.warn('Failed to load image:', recipe.imageUrl);
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </Box>
                  )}

                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                    {recipe.cookTime && (
                      <Typography variant="caption" color="text.secondary">
                        Cook Time: {(() => {
                          const minutes = parseInt(recipe.cookTime);
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
                    )}
                    {recipe.difficulty && (
                      <Typography variant="caption" color="text.secondary">
                        Difficulty: {recipe.difficulty}
                      </Typography>
                    )}
                  </Box>

                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => handleSave(jobId)}
                    disabled={saving && savingRecipeId === jobId}
                    startIcon={saving && savingRecipeId === jobId ? <CircularProgress size={16} /> : null}
                    sx={{ mt: 1 }}
                  >
                    {saving && savingRecipeId === jobId ? 'Saving...' : 'Save Recipe'}
                  </Button>
                </Paper>
              ))}
            </Box>
          </Box>
        )}

      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>
          {t('close', 'Close')}
        </Button>
      </DialogActions>
    </Dialog>
    <Snackbar
      open={!!notification}
      autoHideDuration={6000}
      onClose={() => setNotification(null)}
      message={notification}
    />
    </>
  );
};

export default ImportRecipe; 