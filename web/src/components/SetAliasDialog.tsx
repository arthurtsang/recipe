import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Alert,
} from '@mui/material';

interface SetAliasDialogProps {
  open: boolean;
  onClose: () => void;
  currentAlias: string | null | undefined;
  onSuccess: (alias: string) => void;
}

export default function SetAliasDialog({ open, onClose, currentAlias, onSuccess }: SetAliasDialogProps) {
  const [alias, setAlias] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAlias(currentAlias || '');
      setError(null);
    }
  }, [open, currentAlias]);

  const handleSave = async () => {
    const trimmed = alias.trim();
    if (!trimmed) {
      setError('Profile link cannot be empty');
      return;
    }
    if (!/^[a-z0-9-]+$/i.test(trimmed)) {
      setError('Use only letters, numbers, and hyphens');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/recipes/set-alias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ alias: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to set profile link');
        return;
      }
      onSuccess(trimmed);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set profile link');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Profile link</DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          Your profile link is your shareable URL. Others can open it to see your recipes. Use only letters, numbers, and hyphens.
        </Alert>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        <TextField
          autoFocus
          fullWidth
          label="Profile link"
          placeholder="e.g. myname"
          value={alias}
          onChange={(e) => setAlias(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
          helperText={`Your recipes will be at /users/${alias || '...'}`}
          margin="dense"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
