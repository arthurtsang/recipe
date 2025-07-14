import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import RecipeList from './pages/RecipeList';
import RecipeDetail from './pages/RecipeDetail';
import RecipeForm from './pages/RecipeForm';
import { Container, CssBaseline, AppBar, Toolbar, Typography, Button, Avatar, Menu, MenuItem, IconButton, ListItemIcon } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';

interface User {
  id: string;
  name?: string;
  email: string;
  picture?: string;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const location = useLocation();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

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

  return (
    <>
      <CssBaseline />
      <AppBar position="static" color="default" elevation={0} sx={{ mb: 4 }}>
        <Container maxWidth="lg">
          <Toolbar disableGutters sx={{ px: 2 }}>
            <Typography variant="h6" sx={{ flexGrow: 1 }}>
              Recipe App
            </Typography>
            <Button color="inherit" component={Link} to="/">Home</Button>
            {user ? (
              <>
                <Button color="inherit" component={Link} to="/recipes/new">Add Recipe</Button>
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
                  <MenuItem component="a" href="/logout">
                    <ListItemIcon>
                      <LogoutIcon fontSize="small" />
                    </ListItemIcon>
                    Logout
                  </MenuItem>
                </Menu>
              </>
            ) : (
              <Button color="inherit" href="/auth/google" sx={{ ml: 2 }}>
                Login
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
    </>
  );
}

export default function AppWithRouter() {
  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}
