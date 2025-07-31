import React, { useEffect, useState, useRef, useCallback } from 'react';
import RecipeCard from '../components/RecipeCard';
import { Typography, Box, TextField, Button, Container, CircularProgress } from '@mui/material';
import { useTranslation } from 'react-i18next';

// Define a Recipe type for better type safety
interface Recipe {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  user?: { name?: string; email: string };
  averageRating?: number | null;
  estimatedTime?: string;
  difficulty?: string;
  timeReasoning?: string;
  difficultyReasoning?: string;
  versions?: Array<{
    ingredients: string;
    instructions: string;
  }>;
}

export default function RecipeList() {
  const { t } = useTranslation();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const observer = useRef<IntersectionObserver | null>(null);
  const lastRecipeRef = useCallback((node: HTMLDivElement | null) => {
    if (loading) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new window.IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        setPage(prev => prev + 1);
      }
    });
    if (node) observer.current.observe(node);
  }, [loading, hasMore]);

  useEffect(() => {
    setRecipes([]);
    setPage(1);
    setHasMore(true);
  }, [query]);

  useEffect(() => {
    setLoading(true);
    const pageSize = 12;
    fetch(`/api/recipes${query ? `?q=${encodeURIComponent(query)}` : ''}${query ? '&' : '?'}page=${page}&limit=${pageSize}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then(data => {
        console.log('RecipeList Debug - API Response:', data);
        setRecipes(prev => page === 1 ? data : [...prev, ...data]);
        setHasMore(data.length === pageSize);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [query, page]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery(search);
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #FFF8F0 0%, #F5F5DC 100%)',
        py: 4,
      }}
    >
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <Typography 
            variant="h3" 
            gutterBottom 
            sx={{ 
              fontWeight: 700,
              background: 'linear-gradient(135deg, #D2691E 0%, #FF8C42 100%)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              mb: 2,
            }}
          >
            {t('recipes')}
          </Typography>
          <Typography 
            variant="h6" 
            color="text.secondary"
            sx={{ mb: 4, maxWidth: 600, mx: 'auto' }}
          >
            Discover delicious recipes from our community. Search, explore, and find your next favorite dish.
          </Typography>
        </Box>
        
        <Box 
          component="form" 
          onSubmit={handleSubmit} 
          sx={{ 
            mb: 6, 
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
          <Button 
            type="submit" 
            variant="contained"
            sx={{ px: 4 }}
          >
            {t('search')}
          </Button>
                </Box>
        
        {loading && recipes.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <CircularProgress size={60} sx={{ color: 'primary.main', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">{t('loadingRecipes')}</Typography>
          </Box>
        )}
        
        {error && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography color="error" variant="h6">{t('error')}: {error}</Typography>
          </Box>
        )}
        
        {recipes.length === 0 && !loading ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="h5" color="text.secondary" sx={{ mb: 2 }}>
              {t('noRecipesFound')}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Try adjusting your search terms or browse our collection.
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
              gap: { xs: 2, sm: 3, md: 4 },
              width: '100%',
              mx: 'auto',
              justifyItems: 'center',
            }}
          >
            {recipes.map((recipe, i) => (
              <div key={recipe.id} ref={i === recipes.length - 1 ? lastRecipeRef : undefined} style={{ width: '100%' }}>
                <RecipeCard recipe={recipe} />
              </div>
            ))}
          </Box>
        )}
        
        {loading && recipes.length > 0 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <CircularProgress size={40} sx={{ color: 'primary.main' }} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Loading more recipes...
            </Typography>
          </Box>
        )}
      </Container>
    </Box>
  );
}
