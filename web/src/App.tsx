import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import HomeEntry from './pages/HomeEntry';
import RecipeDetail from './pages/RecipeDetail';
import RecipeForm from './pages/RecipeForm';
import UserRecipePage from './pages/UserRecipePage';
import ImportRecipe from './components/ImportRecipe';
import ImportHistory from './components/ImportHistory';
import RecipeChat from './components/RecipeChat';
import AdminUserApproval from './components/AdminUserApproval';
import AdminQueueStatus from './components/AdminQueueStatus';
import PendingApproval from './components/PendingApproval';
import SettingsDialog from './components/SettingsDialog';
import { RecipeLayoutProvider } from './context/RecipeLayoutContext';
import { Container, CssBaseline, AppBar, Toolbar, Typography, Button, Avatar, Menu, MenuItem, IconButton, ListItemIcon, Box, ThemeProvider, Fab } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import LogoutIcon from '@mui/icons-material/Logout';
import AddIcon from '@mui/icons-material/Add';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import ChatIcon from '@mui/icons-material/Chat';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import QueueIcon from '@mui/icons-material/Queue';
import SettingsIcon from '@mui/icons-material/Settings';
import { useTranslation } from 'react-i18next';
import { theme } from './theme';
import { RECIPE_APP_HOME_MY_REDIRECT_ONCE_KEY } from './constants/homeRouting';

interface User {
  id: string;
  name?: string;
  email: string;
  alias?: string | null;
  displayName?: string;
  picture?: string;
  isAdmin?: boolean;
  isEnabled?: boolean;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const location = useLocation();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importHistoryOpen, setImportHistoryOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [queueDialogOpen, setQueueDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const open = Boolean(anchorEl);
  const { t } = useTranslation();

  useEffect(() => {
    setAuthResolved(false);
    fetch('/api/me', { credentials: 'include' })
      .then(async res => {
        if (res.ok) {
          const data = await res.json();
          setUser(data); // backend now returns the user object directly
        } else {
          setUser(null);
        }
      })
      .catch(() => setUser(null))
      .finally(() => setAuthResolved(true));
  }, [location]);

  useEffect(() => {
    if (authResolved && !user) {
      try {
        sessionStorage.removeItem(RECIPE_APP_HOME_MY_REDIRECT_ONCE_KEY);
      } catch {
        /* ignore */
      }
    }
  }, [authResolved, user]);

  const handleAvatarClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const displayName = user ? (user.displayName || (user.alias && user.alias.trim()) || user.name || user.email) : '';

  const refreshUser = () => {
    fetch('/api/me', { credentials: 'include' }).then(async res => {
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      }
    });
  };

  // Show pending approval screen if user is not enabled
  if (user && user.isEnabled === false) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <PendingApproval userEmail={user.email} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppBar position="static" color="default" elevation={0} sx={{ mb: 4 }}>
        <Container maxWidth="lg">
          <Toolbar disableGutters sx={{ px: 2 }}>
            <Box 
              component={Link} 
              to="/" 
              sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                flexGrow: 1, 
                textDecoration: 'none',
                color: 'inherit',
                '&:hover': {
                  opacity: 0.8
                }
              }}
            >
              <img 
                src="/metro-bistro-icon.png" 
                alt="Metro Bistro" 
                style={{ 
                  height: '40px', 
                  width: '40px', 
                  marginRight: '12px',
                  borderRadius: '4px'
                }} 
              />
              <Typography variant="h6">
              {t('appTitle')}
            </Typography>
            </Box>
            {user ? (
              <>
                <Button 
                  color="inherit" 
                  component={Link} 
                  to="/recipes/new"
                  startIcon={<AddIcon />}
                >
                  {t('addRecipe')}
                </Button>
                <Button 
                  color="inherit" 
                  onClick={() => setImportDialogOpen(true)}
                  startIcon={<FileDownloadIcon />}
                >
                  {t('importRecipe', 'Import')}
                </Button>
                <IconButton onClick={handleAvatarClick} sx={{ ml: 2 }} size="small">
                  <Avatar alt={displayName} src={user.picture} />
                </IconButton>
                <Menu
                  anchorEl={anchorEl}
                  open={open}
                  onClose={handleMenuClose}
                  onClick={handleMenuClose}
                  transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                  anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                >
                  <MenuItem disabled>{displayName}</MenuItem>
                  <MenuItem
                    component={(user.alias && user.alias.trim()) ? Link : 'div'}
                    to={(user.alias && user.alias.trim()) ? `/users/${user.alias.trim()}` : undefined}
                    onClick={!(user.alias && user.alias.trim()) ? () => { setSettingsOpen(true); } : undefined}
                  >
                    <ListItemIcon>
                      <PersonIcon fontSize="small" />
                    </ListItemIcon>
                    {(user.alias && user.alias.trim()) ? t('myRecipes') : t('myRecipesSetProfile')}
                  </MenuItem>
                  <MenuItem onClick={() => setSettingsOpen(true)}>
                    <ListItemIcon>
                      <SettingsIcon fontSize="small" />
                    </ListItemIcon>
                    {t('settings')}
                  </MenuItem>
                  <MenuItem onClick={() => setImportHistoryOpen(true)}>
                    <ListItemIcon>
                      <FileDownloadIcon fontSize="small" />
                    </ListItemIcon>
                    {t('importHistory')}
                  </MenuItem>
                  {user.isAdmin && (
                    <>
                      <MenuItem onClick={() => setAdminDialogOpen(true)}>
                        <ListItemIcon>
                          <AdminPanelSettingsIcon fontSize="small" />
                        </ListItemIcon>
                        User Management
                      </MenuItem>
                      <MenuItem onClick={() => setQueueDialogOpen(true)}>
                        <ListItemIcon>
                          <QueueIcon fontSize="small" />
                        </ListItemIcon>
                        Queue Status
                      </MenuItem>
                    </>
                  )}
                  <MenuItem component="a" href="/logout">
                    <ListItemIcon>
                      <LogoutIcon fontSize="small" />
                    </ListItemIcon>
                    {t('logout')}
                  </MenuItem>
                </Menu>
              </>
            ) : (
              <Button color="inherit" href="/auth/google" sx={{ ml: 2 }}>
                {t('login')}
              </Button>
            )}
          </Toolbar>
        </Container>
      </AppBar>
      <Container maxWidth="lg" disableGutters sx={{ px: { xs: 1, sm: 2, md: 4 }, mt: 4 }}>
        <Routes>
          <Route path="/" element={<HomeEntry authResolved={authResolved} user={user} />} />
          <Route path="/users/:alias" element={<UserRecipePage viewer={user} authResolved={authResolved} />} />
          <Route path="/recipes/new" element={<RecipeForm user={user} />} />
          <Route path="/recipes/:id/edit" element={<RecipeForm user={user} />} />
          <Route path="/recipes/:id" element={<RecipeDetail user={user} />} />
        </Routes>
      </Container>
      
      {/* Chat Floating Action Button - Only show for authenticated users */}
      {user && (
        <Fab
          color="primary"
          aria-label="chat"
          onClick={() => setChatOpen(true)}
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 1000,
            boxShadow: '0 4px 20px rgba(210, 105, 30, 0.3)',
          }}
        >
          <ChatIcon />
        </Fab>
      )}
      
      <ImportRecipe 
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
      />
      
      <ImportHistory
        open={importHistoryOpen}
        onClose={() => setImportHistoryOpen(false)}
      />
      
      <RecipeChat
        open={chatOpen}
        onClose={() => setChatOpen(false)}
      />
      
      <AdminUserApproval
        open={adminDialogOpen}
        onClose={() => setAdminDialogOpen(false)}
      />
      
      <AdminQueueStatus
        open={queueDialogOpen}
        onClose={() => setQueueDialogOpen(false)}
      />
      
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        currentAlias={user?.alias ?? undefined}
        onAliasSuccess={(newAlias) => {
          setUser(prev => prev ? { ...prev, alias: newAlias } : null);
          refreshUser();
        }}
      />
    </ThemeProvider>
  );
}

export default function AppWithRouter() {
  return (
    <BrowserRouter>
      <RecipeLayoutProvider>
        <App />
      </RecipeLayoutProvider>
    </BrowserRouter>
  );
}
