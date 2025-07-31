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
  Alert
} from '@mui/material';
import { Close as CloseIcon, Refresh as RefreshIcon, Delete as DeleteIcon } from '@mui/icons-material';

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
  createdAt: string;
  updatedAt: string;
}

const ImportHistory: React.FC<ImportHistoryProps> = ({ open, onClose }) => {
  const navigate = useNavigate();
  const [imports, setImports] = useState<ImportJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

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

    setSaving(job.id);
    try {
      const response = await fetch('/api/recipes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: job.result.title,
          description: job.result.description,
          ingredients: job.result.ingredients,
          instructions: job.result.instructions,
          imageUrl: job.result.imageUrl,
          estimatedTime: job.result.estimatedTime,
          difficulty: job.result.difficulty,
          timeReasoning: job.result.timeReasoning,
          difficultyReasoning: job.result.difficultyReasoning,
        }),
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save recipe');
      }

      const data = await response.json();
      
      // Mark this job as saved in the local state
      setImports(prev => prev.map(importJob => 
        importJob.id === job.id 
          ? { ...importJob, result: { ...importJob.result, saved: true } }
          : importJob
      ));
      
      onClose();
      navigate(`/recipes/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save recipe');
    } finally {
      setSaving(null);
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
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
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
                    <Box display="flex" alignItems="center" gap={1}>
                      <Typography variant="subtitle1">
                        {job.result?.title || truncateUrl(job.url)}
                      </Typography>
                      <Chip
                        label={job.status}
                        color={getStatusColor(job.status) as any}
                        size="small"
                      />
                    </Box>
                  }
                  secondary={
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        {truncateUrl(job.url)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Created: {formatDate(job.createdAt)}
                      </Typography>
                      {job.error && (
                        <Typography variant="body2" color="error" sx={{ mt: 1 }}>
                          Error: {job.error}
                        </Typography>
                      )}
                    </Box>
                  }
                />
                
                <ListItemSecondaryAction>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    {job.status === 'completed' && job.result && !job.result.saved && (
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
                    {job.status === 'completed' && job.result && job.result.saved && (
                      <Chip label="Saved" color="success" size="small" />
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