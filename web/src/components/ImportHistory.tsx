import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
  IconButton,
  CircularProgress,
  Alert,
  Link,
  Collapse,
  Paper,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { Close as CloseIcon, Refresh as RefreshIcon, Delete as DeleteIcon, OpenInNew as OpenInNewIcon, Replay as ReplayIcon } from '@mui/icons-material';

import { useNavigate } from 'react-router-dom';

interface ImportHistoryProps {
  open: boolean;
  onClose: () => void;
}

interface ImportJob {
  id: string;
  url: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: any;
  error?: string;
  savedRecipeId?: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

const ImportHistory: React.FC<ImportHistoryProps> = ({ open, onClose }) => {
  const navigate = useNavigate();
  const [imports, setImports] = useState<ImportJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [reimporting, setReimporting] = useState<string | null>(null);
  const [expandedResponseId, setExpandedResponseId] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  const fetchImports = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/imports/user', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch imports');
      }

      const data = await response.json();
      setImports(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch imports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchImports();
    }
  }, [open]);

  const handleSaveRecipe = async (job: ImportJob) => {
    if (!job.result) return;
    if (job.savedRecipeId) return; // Already saved; idempotent

    setSaving(job.id);
    try {
      const response = await fetch(`/api/imports/${job.id}/save-recipe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save recipe');
      }

      const data = await response.json();
      const recipeId = data?.id;

      setImports(prev => prev.map(importJob =>
        importJob.id === job.id ? { ...importJob, savedRecipeId: recipeId } : importJob
      ));
      
      // Don't navigate - stay on the import history page
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save recipe');
    } finally {
      setSaving(null);
    }
  };

  const handleReimport = async (job: ImportJob) => {
    if (!job.url?.trim()) return;
    setReimporting(job.id);
    setError(null);
    try {
      const response = await fetch('/api/imports/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ urls: [job.url.trim()] }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to start reimport');
      }
      setNotification('Reimport started. Refresh the list to see the new job. When it completes, save to add a new version to the same recipe.');
      fetchImports();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start reimport');
    } finally {
      setReimporting(null);
    }
  };

  const handleDeleteImport = async (job: ImportJob) => {
    setDeleting(job.id);
    try {
      const response = await fetch(`/api/imports/${job.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete import');
      }

      // Remove from local state
      setImports(prev => prev.filter(importJob => importJob.id !== job.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete import');
    } finally {
      setDeleting(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'success';
      case 'failed': return 'error';
      case 'processing': return 'warning';
      default: return 'default';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const truncateUrl = (url: string) => {
    if (url.length > 50) {
      return url.substring(0, 47) + '...';
    }
    return url;
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">Import History</Typography>
          <Box>
            <IconButton onClick={fetchImports} disabled={loading}>
              <RefreshIcon />
            </IconButton>
            <IconButton onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </Box>
        </Box>
      </DialogTitle>
      
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {notification && (
          <Alert severity="info" sx={{ mb: 2 }} onClose={() => setNotification(null)}>
            {notification}
          </Alert>
        )}

        {loading ? (
          <Box display="flex" justifyContent="center" p={3}>
            <CircularProgress />
          </Box>
        ) : imports.length === 0 ? (
          <Typography variant="body2" color="text.secondary" textAlign="center" py={3}>
            No imports found. Start importing recipes to see them here.
          </Typography>
        ) : (
          <List>
            {imports.map((job) => (
              <ListItem key={job.id} divider>
                <ListItemText
                  primary={
                    <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                      <Typography variant="subtitle1">
                        {job.result?.title || truncateUrl(job.url)}
                      </Typography>
                      <Chip
                        label={job.status === 'completed' ? 'imported' : job.status}
                        color={getStatusColor(job.status) as any}
                        size="small"
                      />
                      {job.savedRecipeId && (
                        <Chip label="saved" color="success" size="small" />
                      )}
                    </Box>
                  }
                  secondary={
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        {truncateUrl(job.url)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Created: {formatDate(job.createdAt)}
                        {job.startedAt != null && ` · Started: ${formatDate(job.startedAt)}`}
                        {job.completedAt != null && ` · Completed: ${formatDate(job.completedAt)}`}
                      </Typography>
                      {job.error && (
                        <Typography variant="body2" color="error" sx={{ mt: 0.5 }}>
                          Error: {job.error.length > 120 ? job.error.slice(0, 120) + '…' : job.error}
                        </Typography>
                      )}
                      <Box sx={{ mt: 1 }}>
                        <Button
                          size="small"
                          startIcon={expandedResponseId === job.id ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                          onClick={() => setExpandedResponseId(expandedResponseId === job.id ? null : job.id)}
                          sx={{ textTransform: 'none' }}
                        >
                          {expandedResponseId === job.id ? 'Hide' : 'Show'} AI service response
                        </Button>
                        <Collapse in={expandedResponseId === job.id}>
                          <Paper variant="outlined" sx={{ p: 1.5, mt: 1, bgcolor: 'grey.50', maxHeight: 220, overflow: 'auto' }}>
                            <Typography component="pre" variant="caption" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                              {job.status === 'failed' && job.error
                                ? job.error
                                : job.result != null
                                  ? JSON.stringify(job.result, null, 2)
                                  : 'No response data'}
                            </Typography>
                          </Paper>
                        </Collapse>
                      </Box>
                    </Box>
                  }
                />
                
                <ListItemSecondaryAction>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                    {!job.savedRecipeId && (
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => handleReimport(job)}
                        disabled={reimporting === job.id || !job.url?.trim()}
                        startIcon={reimporting === job.id ? <CircularProgress size={16} /> : <ReplayIcon />}
                        title="Run import again (same URL). When you save, a new version is added to the same recipe if it already exists."
                      >
                        {reimporting === job.id ? 'Starting…' : 'Reimport'}
                      </Button>
                    )}
                    {job.status === 'completed' && job.result && !job.savedRecipeId && (
                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => handleSaveRecipe(job)}
                        disabled={saving === job.id}
                        startIcon={saving === job.id ? <CircularProgress size={16} /> : null}
                      >
                        {saving === job.id ? 'Saving...' : 'Save Recipe'}
                      </Button>
                    )}
                    {job.status === 'completed' && job.result && job.savedRecipeId && (
                      <Link
                        href={`/recipes/${job.savedRecipeId}`}
                        onClick={(e) => {
                          e.preventDefault();
                          // Close dialog first — otherwise the Modal backdrop stays and looks like a black page.
                          onClose();
                          navigate(`/recipes/${job.savedRecipeId}`);
                        }}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                          textDecoration: 'none',
                          fontSize: '0.875rem'
                        }}
                      >
                        <OpenInNewIcon fontSize="small" />
                        Open Recipe
                      </Link>
                    )}
                    <IconButton
                      size="small"
                      onClick={() => handleDeleteImport(job)}
                      disabled={deleting === job.id}
                      color="error"
                    >
                      {deleting === job.id ? <CircularProgress size={16} /> : <DeleteIcon />}
                    </IconButton>
                  </Box>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ImportHistory; 