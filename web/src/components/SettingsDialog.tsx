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
  Divider,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import CloseIcon from '@mui/icons-material/Close';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import ViewListIcon from '@mui/icons-material/ViewList';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { useRecipeLayout } from '../context/RecipeLayoutContext';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  currentAlias?: string | null;
  onAliasSuccess?: (alias: string) => void;
}

export default function SettingsDialog({
  open,
  onClose,
  currentAlias,
  onAliasSuccess,
}: SettingsDialogProps) {
  const { t } = useTranslation();
  const { layout, setLayout } = useRecipeLayout();
  const currentLang = i18n.language?.split('-')[0] || 'en';

  const [alias, setAlias] = useState('');
  const [aliasSaving, setAliasSaving] = useState(false);
  const [aliasError, setAliasError] = useState<string | null>(null);

  const [apiToken, setApiToken] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenRefreshing, setTokenRefreshing] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchToken = async () => {
    setTokenLoading(true);
    setTokenError(null);
    try {
      const res = await fetch('/api/me/token', {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || data?.message || res.statusText || `Failed to load token (${res.status})`);
      }
      setApiToken(data.apiToken || null);
    } catch (e) {
      setTokenError(e instanceof Error ? e.message : 'Failed to load token');
      setApiToken(null);
    } finally {
      setTokenLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setAlias(currentAlias || '');
      setAliasError(null);
      setShowToken(false);
      setCopied(false);
      fetchToken();
    }
  }, [open, currentAlias]);

  const handleSaveAlias = async () => {
    const trimmed = alias.trim();
    if (!trimmed) {
      setAliasError(t('profileLinkEmpty'));
      return;
    }
    if (!/^[a-z0-9-]+$/i.test(trimmed)) {
      setAliasError(t('profileLinkInvalid'));
      return;
    }
    setAliasSaving(true);
    setAliasError(null);
    try {
      const res = await fetch('/api/recipes/set-alias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ alias: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAliasError(data.error || t('profileLinkSaveFailed'));
        return;
      }
      onAliasSuccess?.(trimmed);
    } catch (err) {
      setAliasError(err instanceof Error ? err.message : t('profileLinkSaveFailed'));
    } finally {
      setAliasSaving(false);
    }
  };

  const handleRefreshToken = async () => {
    setTokenRefreshing(true);
    setTokenError(null);
    try {
      const res = await fetch('/api/me/token/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || data?.message || res.statusText || `Failed to refresh token (${res.status})`);
      }
      setApiToken(data.apiToken || null);
      setShowToken(true);
    } catch (e) {
      setTokenError(e instanceof Error ? e.message : 'Failed to refresh token');
    } finally {
      setTokenRefreshing(false);
    }
  };

  const handleCopyToken = async () => {
    if (!apiToken) return;
    try {
      await navigator.clipboard.writeText(apiToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setTokenError('Copy failed');
    }
  };

  const handleLanguageChange = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  const displayToken = apiToken ? (showToken ? apiToken : '•'.repeat(56)) : '';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">{t('settings')}</Typography>
          <IconButton onClick={onClose} aria-label={t('close')}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          {t('settingsDisplay')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {t('recipeLayoutDescription')}
        </Typography>
        <ToggleButtonGroup
          value={layout}
          exclusive
          onChange={(_, value) => value && setLayout(value)}
          size="small"
          fullWidth
          aria-label={t('recipeLayout')}
        >
          <ToggleButton value="tile" aria-label={t('layoutTiles')}>
            <ViewModuleIcon sx={{ mr: 1 }} fontSize="small" />
            {t('layoutTiles')}
          </ToggleButton>
          <ToggleButton value="list" aria-label={t('layoutList')}>
            <ViewListIcon sx={{ mr: 1 }} fontSize="small" />
            {t('layoutList')}
          </ToggleButton>
        </ToggleButtonGroup>

        <Divider sx={{ my: 3 }} />

        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          {t('settingsProfile')}
        </Typography>
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('profileLinkHelp')}
        </Alert>
        {aliasError && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setAliasError(null)}>
            {aliasError}
          </Alert>
        )}
        <TextField
          fullWidth
          size="small"
          label={t('profileLink')}
          placeholder="e.g. myname"
          value={alias}
          onChange={(e) => setAlias(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
          helperText={t('profileLinkPreview', { path: alias || '...' })}
          margin="dense"
        />
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
          <Button
            variant="contained"
            size="small"
            onClick={handleSaveAlias}
            disabled={aliasSaving}
          >
            {aliasSaving ? t('saving') : t('save')}
          </Button>
        </Box>

        <Divider sx={{ my: 3 }} />

        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          {t('language')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {t('language')}: {currentLang === 'zh' ? t('chinese') : t('english')}
        </Typography>
        <ToggleButtonGroup
          value={currentLang}
          exclusive
          onChange={(_, value) => value && handleLanguageChange(value)}
          size="small"
          fullWidth
        >
          <ToggleButton value="en">{t('english')}</ToggleButton>
          <ToggleButton value="zh">{t('chinese')}</ToggleButton>
        </ToggleButtonGroup>

        <Divider sx={{ my: 3 }} />

        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          {t('settingsApiToken')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('apiTokenHelp')}
        </Typography>
        {tokenError && (
          <Alert severity="error" onClose={() => setTokenError(null)} sx={{ mb: 2 }}>
            {tokenError}
          </Alert>
        )}
        {tokenLoading ? (
          <Box display="flex" justifyContent="center" py={2}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <TextField
            fullWidth
            size="small"
            label={t('apiToken')}
            value={displayToken}
            inputProps={{ readOnly: true }}
            variant="outlined"
            InputProps={{
              endAdornment: apiToken ? (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowToken((s) => !s)}
                    edge="end"
                    aria-label={showToken ? t('hideToken') : t('showToken')}
                  >
                    {showToken ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                  <IconButton onClick={handleCopyToken} edge="end" aria-label={t('copyToken')}>
                    <ContentCopyIcon />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            }}
          />
        )}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 1.5 }}>
          {apiToken && (
            <Button startIcon={<ContentCopyIcon />} onClick={handleCopyToken} size="small" disabled={tokenLoading}>
              {copied ? t('copied') : t('copyToken')}
            </Button>
          )}
          <Button
            startIcon={tokenRefreshing ? <CircularProgress size={16} /> : <RefreshIcon />}
            onClick={handleRefreshToken}
            size="small"
            disabled={tokenLoading || tokenRefreshing}
          >
            {t('refreshToken')}
          </Button>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>{t('close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
