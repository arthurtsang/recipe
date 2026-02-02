import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ScheduleIcon from '@mui/icons-material/Schedule';
import PsychologyIcon from '@mui/icons-material/Psychology';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ReplayIcon from '@mui/icons-material/Replay';

interface ImportJobRow {
  id: string;
  url: string;
  userId: string;
  createdAt?: string;
  updatedAt?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  error?: string | null;
}

interface RecipeRow {
  id: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
}

interface QueuesData {
  import: {
    pendingCount: number;
    processingCount: number;
    pendingJobs: ImportJobRow[];
    processingJobs: ImportJobRow[];
    recentFailed?: ImportJobRow[];
    recentCompleted?: ImportJobRow[];
  };
  recipeAnalysis: {
    pendingCount: number;
    pendingRecipes: RecipeRow[];
    recentAnalyzedRecipes?: RecipeRow[];
  };
}

interface AdminQueueStatusProps {
  open: boolean;
  onClose: () => void;
}

type TabValue = 'import' | 'analysis' | 'failure' | 'success';

export default function AdminQueueStatus({ open, onClose }: AdminQueueStatusProps) {
  const [data, setData] = useState<QueuesData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabValue>('import');
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);

  const fetchQueues = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/queues', { credentials: 'include', headers: { Accept: 'application/json' } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = body?.error || body?.message || res.statusText || `Error ${res.status}`;
        throw new Error(msg);
      }
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchQueues();
  }, [open]);

  const formatDate = (s: string) => {
    try {
      return new Date(s).toLocaleString();
    } catch {
      return s;
    }
  };

  const retryJob = async (id: string) => {
    setRetryingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/import-jobs/${id}/retry`, {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || body?.message || res.statusText);
      await fetchQueues();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Retry failed');
    } finally {
      setRetryingId(null);
    }
  };

  const retryAllFailed = async () => {
    setRetryingAll(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/import-jobs/retry-all', {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || body?.message || res.statusText);
      await fetchQueues();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Retry all failed');
    } finally {
      setRetryingAll(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Import &amp; Analysis Queues</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Import: 1 at a time, every 2 min. Recipe analysis (difficulty &amp; cook time): 1 at a time, every 5 min.
        </Typography>
        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {loading && !data ? (
          <Box display="flex" justifyContent="center" py={3}>
            <CircularProgress />
          </Box>
        ) : data ? (
          <>
            <Tabs value={tab} onChange={(_, v: TabValue) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
              <Tab value="import" label="Import Queue" icon={<ScheduleIcon />} iconPosition="start" />
              <Tab value="analysis" label="Recipe Analysis" icon={<PsychologyIcon />} iconPosition="start" />
              <Tab value="failure" label="Recent Failure" icon={<ErrorOutlineIcon />} iconPosition="start" />
              <Tab value="success" label="Recent Success" icon={<CheckCircleOutlineIcon />} iconPosition="start" />
            </Tabs>

            {/* Import Queue tab */}
            {tab === 'import' && (
              <Box>
                <Box sx={{ mb: 1 }}>
                  <Chip label={`Processing: ${data.import.processingCount}`} color="primary" size="small" />
                </Box>
                {data.import.processingJobs.length > 0 ? (
                  <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Status</TableCell>
                          <TableCell>URL</TableCell>
                          <TableCell>Started</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {data.import.processingJobs.map((j) => (
                          <TableRow key={j.id}>
                            <TableCell>
                              <Chip label="processing" color="primary" size="small" />
                            </TableCell>
                            <TableCell sx={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {j.url}
                            </TableCell>
                            <TableCell>{j.startedAt ? formatDate(j.startedAt) : ((j as any).updatedAt ? formatDate((j as any).updatedAt) : '—')}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>No jobs currently processing.</Typography>
                )}
                <Box sx={{ mb: 1, mt: 2 }}>
                  <Chip label={`Pending: ${data.import.pendingCount}`} color="default" size="small" />
                </Box>
                {data.import.pendingJobs.length > 0 ? (
                  <>
                    <TableContainer component={Paper} variant="outlined">
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>URL</TableCell>
                            <TableCell>Created</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {data.import.pendingJobs.slice(0, 50).map((j) => (
                          <TableRow key={j.id}>
                            <TableCell sx={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {j.url}
                            </TableCell>
                            <TableCell>{j.createdAt ? formatDate(j.createdAt) : '—'}</TableCell>
                          </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                    {data.import.pendingJobs.length > 50 && (
                      <Typography variant="caption" sx={{ px: 2, py: 1, display: 'block' }}>
                        Showing first 50 of {data.import.pendingJobs.length} pending jobs.
                      </Typography>
                    )}
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary">No pending import jobs.</Typography>
                )}
              </Box>
            )}

            {/* Recipe Analysis tab */}
            {tab === 'analysis' && (
              <Box>
                <Box sx={{ mb: 1 }}>
                  <Chip label={`Pending: ${data.recipeAnalysis.pendingCount}`} color="default" size="small" />
                </Box>
                {data.recipeAnalysis.pendingRecipes.length > 0 ? (
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Title</TableCell>
                          <TableCell>Created</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {data.recipeAnalysis.pendingRecipes.slice(0, 50).map((r) => (
                          <TableRow key={r.id}>
                            <TableCell sx={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {r.title}
                            </TableCell>
                            <TableCell>{r.createdAt ? formatDate(r.createdAt) : '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {data.recipeAnalysis.pendingRecipes.length > 50 && (
                      <Typography variant="caption" sx={{ px: 2, py: 1, display: 'block' }}>
                        Showing first 50 of {data.recipeAnalysis.pendingRecipes.length} recipes.
                      </Typography>
                    )}
                  </TableContainer>
                ) : (
                  <Typography variant="body2" color="text.secondary">No recipes pending analysis.</Typography>
                )}
              </Box>
            )}

            {/* Recent Failure tab */}
            {tab === 'failure' && (
              <Box>
                {(data.import.recentFailed?.length ?? 0) > 0 ? (
                  <>
                    <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>URL</TableCell>
                            <TableCell>Error</TableCell>
                            <TableCell>Completed</TableCell>
                            <TableCell align="right">Actions</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {data.import.recentFailed!.map((j) => (
                            <TableRow key={j.id}>
                              <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }} title={j.url}>
                                {j.url}
                              </TableCell>
                              <TableCell sx={{ maxWidth: 240, fontSize: '0.75rem' }} title={j.error || ''}>
                                {(j.error || '').slice(0, 60)}{(j.error && j.error.length > 60) ? '…' : ''}
                              </TableCell>
                              <TableCell>{j.completedAt ? formatDate(j.completedAt) : '—'}</TableCell>
                              <TableCell align="right">
                                <Button
                                  size="small"
                                  startIcon={<ReplayIcon />}
                                  onClick={() => retryJob(j.id)}
                                  disabled={retryingId === j.id || retryingAll}
                                >
                                  Retry
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                    <Button
                      variant="contained"
                      startIcon={<ReplayIcon />}
                      onClick={retryAllFailed}
                      disabled={retryingAll || (data.import.recentFailed?.length ?? 0) === 0}
                    >
                      {retryingAll ? 'Retrying…' : 'Retry all failed'}
                    </Button>
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary">No recent failed import jobs.</Typography>
                )}
              </Box>
            )}

            {/* Recent Success tab */}
            {tab === 'success' && (
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Last 10 completed imports</Typography>
                {(data.import.recentCompleted?.length ?? 0) > 0 ? (
                  <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>URL</TableCell>
                          <TableCell>Completed</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {data.import.recentCompleted!.map((j) => (
                          <TableRow key={j.id}>
                            <TableCell sx={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis' }} title={j.url}>
                              {j.url}
                            </TableCell>
                            <TableCell>{j.completedAt ? formatDate(j.completedAt) : '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>No recent completed imports.</Typography>
                )}
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Last 10 recipe analyses</Typography>
                {(data.recipeAnalysis.recentAnalyzedRecipes?.length ?? 0) > 0 ? (
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Title</TableCell>
                          <TableCell>Updated</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {data.recipeAnalysis.recentAnalyzedRecipes!.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell sx={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {r.title}
                            </TableCell>
                            <TableCell>{r.updatedAt ? formatDate(r.updatedAt) : '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <Typography variant="body2" color="text.secondary">No recent recipe analyses.</Typography>
                )}
              </Box>
            )}
          </>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button startIcon={<RefreshIcon />} onClick={fetchQueues} disabled={loading}>
          Refresh
        </Button>
      </DialogActions>
    </Dialog>
  );
}
