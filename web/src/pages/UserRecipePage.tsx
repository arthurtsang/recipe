import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import RecipeCard from '../components/RecipeCard';
import { Typography, Box, Button, Container, CircularProgress, TextField } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import { useTranslation } from 'react-i18next';
import { RECIPE_APP_HOME_MY_REDIRECT_ONCE_KEY, type RecipeAppHomeLandingState } from '../constants/homeRouting';

interface User {
  id: string;
  name?: string | null;
  email: string;
  alias?: string | null;
  displayName?: string;
  picture?: string | null;
}

interface Recipe {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  user?: User;
  averageRating?: number | null;
  estimatedTime?: string;
  difficulty?: string;
  versions?: Array<{ ingredients: string; instructions: string }>;
}

function recipeMatchesQuery(recipe: Recipe, raw: string): boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return true;
  const inText = (s?: string | null) => (s ?? '').toLowerCase().includes(q);
  if (inText(recipe.title) || inText(recipe.description)) return true;
  return (
    recipe.versions?.some(
      v => inText(v.ingredients) || inText(v.instructions)
    ) ?? false
  );
}

interface UserRecipePageProps {
  viewer?: { alias?: string | null } | null;
  authResolved?: boolean;
}

export default function UserRecipePage({
  viewer = null,
  authResolved = false,
}: UserRecipePageProps) {
  const { alias } = useParams<{ alias: string }>();
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    setSearch('');
    setQuery('');
  }, [alias]);

  useEffect(() => {
    if (!authResolved || !viewer?.alias?.trim() || !alias) return;
    const st = location.state as RecipeAppHomeLandingState | undefined;
    if (!st?.recipeAppHomeLanding) return;
    const routeAlias = alias.trim().toLowerCase();
    const mine = viewer.alias!.trim().toLowerCase();
    if (!routeAlias || routeAlias !== mine) return;
    try {
      sessionStorage.setItem(RECIPE_APP_HOME_MY_REDIRECT_ONCE_KEY, '1');
    } catch {
      /* ignore */
    }
    navigate(
      { pathname: location.pathname, search: location.search },
      { replace: true, state: {} },
    );
  }, [authResolved, viewer, alias, location.pathname, location.search, location.state, navigate]);

  useEffect(() => {
    if (!alias) return;
    setLoading(true);
    setError(null);
    fetch(`/api/recipes/user/${encodeURIComponent(alias)}`)
      .then(async res => {
        if (!res.ok) {
          if (res.status === 404) throw new Error('User not found');
          throw new Error('Failed to load');
        }
        return res.json();
      })
      .then(data => {
        setUser(data.user);
        const withUser = (data.recipes || []).map((r: Recipe) => ({ ...r, user: data.user }));
        setRecipes(withUser);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [alias]);

  const filteredRecipes = useMemo(
    () => recipes.filter(r => recipeMatchesQuery(r, query)),
    [recipes, query]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery(search);
  };

  const displayName = user ? (user.displayName || (user.alias && user.alias.trim()) || user.name || user.email) : '';

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !user) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Typography variant="h5" color="text.secondary">
          {error || 'User not found'}
        </Typography>
        <Button component={Link} to="/" startIcon={<ArrowBackIcon />} sx={{ mt: 2 }}>
          Browse all recipes
        </Button>
      </Container>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #FFF8F0 0%, #F5F5DC 100%)',
        py: 4,
      }}
    >
      <Container maxWidth="lg">
        <Box sx={{ mb: 4 }}>
          <Button
            component={Link}
            to="/"
            startIcon={<ArrowBackIcon />}
            sx={{ mb: 2, textTransform: 'none' }}
          >
            Browse all recipes
          </Button>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
            <RestaurantIcon sx={{ color: 'text.secondary' }} />
            <Typography variant="h4" sx={{ fontWeight: 600 }}>
              {displayName}'s recipes
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            You're viewing this user's recipe collection. Use the link above to see all recipes.
          </Typography>
        </Box>

        {recipes.length > 0 && (
          <Box
            component="form"
            onSubmit={handleSubmit}
            sx={{
              mb: 4,
              display: 'flex',
              gap: 2,
              maxWidth: 600,
              width: '100%',
              mx: 'auto',
              background: 'white',
              p: 3,
              borderRadius: 3,
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
            }}
          >
            <TextField
              type="text"
              label={t('searchPlaceholder')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              variant="outlined"
              size="small"
              fullWidth
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                },
              }}
            />
            <Button type="submit" variant="contained" sx={{ px: 4 }}>
              {t('search')}
            </Button>
          </Box>
        )}

        {recipes.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="h6" color="text.secondary">
              No recipes yet
            </Typography>
          </Box>
        ) : filteredRecipes.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="h5" color="text.secondary" sx={{ mb: 2 }}>
              {t('noRecipesFound')}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {t('tryAdjustingSearch')}
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
              gap: { xs: 2, sm: 3, md: 4 },
              width: '100%',
              justifyItems: 'center',
            }}
          >
            {filteredRecipes.map(recipe => (
              <Box key={recipe.id} sx={{ width: '100%' }}>
                <RecipeCard recipe={recipe} />
              </Box>
            ))}
          </Box>
        )}
      </Container>
    </Box>
  );
}
