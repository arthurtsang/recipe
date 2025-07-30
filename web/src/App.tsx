import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import RecipeList from './pages/RecipeList';
import RecipeDetail from './pages/RecipeDetail';
import RecipeForm from './pages/RecipeForm';
import ImportRecipe from './components/ImportRecipe';
import RecipeChat from './components/RecipeChat';
import AdminUserApproval from './components/AdminUserApproval';
import PendingApproval from './components/PendingApproval';
import { Container, CssBaseline, AppBar, Toolbar, Typography, Button, Avatar, Menu, MenuItem, IconButton, ListItemIcon, Box, ThemeProvider, Fab } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import AddIcon from '@mui/icons-material/Add';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import ChatIcon from '@mui/icons-material/Chat';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import { useTranslation } from 'react-i18next';
import i18n from './i18n';
import { theme } from './theme';

interface User {
  id: string;
  name?: string;
  email: string;
  picture?: string;
  isAdmin?: boolean;
  isEnabled?: boolean;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const location = useLocation();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const open = Boolean(anchorEl);
  const { t } = useTranslation();
  const currentLang = i18n.language?.split('-')[0] || 'en';
  const browserLang = (navigator.language || 'en').split('-')[0];

  useEffect(() => {
    fetch('/api/me', { credentials: 'include' }).then(async res => {
      if (res.ok) {
        const data = await res.json();
        setUser(data); // backend now returns the user object directly
      } else {
        setUser(null);
      }
    });
  }, [location]);

  const handleAvatarClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLanguageChange = (lng: string) => {
    i18n.changeLanguage(lng);
    handleMenuClose();
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
                  <Avatar alt={user.name} src={user.picture} />
                </IconButton>
                <Menu
                  anchorEl={anchorEl}
                  open={open}
                  onClose={handleMenuClose}
                  onClick={handleMenuClose}
                  transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                  anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                >
                  <MenuItem disabled>{user.name || user.email}</MenuItem>
                  <MenuItem disabled>{t('language')}: {currentLang === 'zh' ? t('chinese') : t('english')}</MenuItem>
                  {/* Only allow switching if authenticated */}
                  <MenuItem
                    onClick={() => handleLanguageChange(currentLang === 'en' ? 'zh' : 'en')}
                    disabled={currentLang !== browserLang && !user}
                  >
                    {currentLang === 'en' ? t('chinese') : t('english')}
                  </MenuItem>
                  {user.isAdmin && (
                    <MenuItem onClick={() => setAdminDialogOpen(true)}>
                      <ListItemIcon>
                        <AdminPanelSettingsIcon fontSize="small" />
                      </ListItemIcon>
                      User Management
                    </MenuItem>
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
          <Route path="/" element={<RecipeList />} />
          <Route path="/recipes/new" element={<RecipeForm user={user} />} />
          <Route path="/recipes/:id/edit" element={<RecipeForm user={user} />} />
          <Route path="/recipes/:id" element={<RecipeDetail user={user} />} />
        </Routes>
      </Container>
      
      {/* Chat Floating Action Button */}
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
      
      <ImportRecipe 
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
      />
      
      <RecipeChat
        open={chatOpen}
        onClose={() => setChatOpen(false)}
      />
      
      <AdminUserApproval
        open={adminDialogOpen}
        onClose={() => setAdminDialogOpen(false)}
      />
    </ThemeProvider>
  );
}

export default function AppWithRouter() {
  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}
