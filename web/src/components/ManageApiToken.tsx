import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  IconButton,
  InputAdornment,
  TextField,
  Alert,
  CircularProgress,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';

interface ManageApiTokenProps {
  open: boolean;
  onClose: () => void;
}

export default function ManageApiToken({ open, onClose }: ManageApiTokenProps) {
  const [apiToken, setApiToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchToken = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/me/token', {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error || data?.message || res.statusText || `Failed to load token (${res.status})`;
        throw new Error(msg);
      }
      setApiToken(data.apiToken || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load token');
      setApiToken(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchToken();
      setShowToken(false);
      setCopied(false);
    }
  }, [open]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch('/api/me/token/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error || data?.message || res.statusText || `Failed to refresh token (${res.status})`;
        throw new Error(msg);
      }
      setApiToken(data.apiToken || null);
      setShowToken(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to refresh token');
    } finally {
      setRefreshing(false);
    }
  };

  const handleCopy = async () => {
    if (!apiToken) return;
    try {
      await navigator.clipboard.writeText(apiToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {
      setError('Copy failed');
    }
  };

  const displayValue = apiToken
    ? showToken
      ? apiToken
      : '•'.repeat(56)
    : '';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Manage API Token</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Use this token to authenticate API requests (e.g. Bearer token). Keep it secret. Refreshing generates a new token and invalidates the previous one.
        </Typography>
        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {loading ? (
          <Box display="flex" justifyContent="center" py={3}>
            <CircularProgress size={32} />
          </Box>
        ) : (
          <TextField
            fullWidth
            size="small"
            label="API Token"
            value={displayValue}
            inputProps={{ readOnly: true }}
            variant="outlined"
            InputProps={{
              endAdornment: apiToken ? (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowToken((s) => !s)}
                    edge="end"
                    aria-label={showToken ? 'Hide token' : 'Show token'}
                  >
                    {showToken ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                  <IconButton onClick={handleCopy} edge="end" aria-label="Copy token">
                    <ContentCopyIcon />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            }}
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {apiToken && (
          <Button startIcon={<ContentCopyIcon />} onClick={handleCopy} disabled={loading}>
            {copied ? 'Copied!' : 'Copy'}
          </Button>
        )}
        <Button
          startIcon={refreshing ? <CircularProgress size={16} /> : <RefreshIcon />}
          onClick={handleRefresh}
          disabled={loading || refreshing}
        >
          Refresh token
        </Button>
      </DialogActions>
    </Dialog>
  );
}
