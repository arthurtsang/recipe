import React, { useEffect, useState, useRef, useCallback } from 'react';
import RecipeCard from '../components/RecipeCard';
import { Typography, Box, TextField, Button } from '@mui/material';
import { useTranslation } from 'react-i18next';

// Define a Recipe type for better type safety
interface Recipe {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  user?: { name?: string; email: string };
  averageRating?: number | null;
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
        maxWidth: 'lg',
        minHeight: '100vh',
        bgcolor: 'background.default',
        px: { xs: 2, sm: 4, md: 8 },
        py: 4,
        boxSizing: 'border-box',
        mx: 'auto',
      }}
    >
      <Typography variant="h4" gutterBottom>{t('recipes')}</Typography>
      <Box component="form" onSubmit={handleSubmit} sx={{ mb: 4, display: 'flex', gap: 2, maxWidth: 700, width: '100%', mx: 'auto' }}>
        <TextField
          type="text"
          label={t('searchPlaceholder')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          variant="outlined"
          size="small"
          fullWidth
        />
        <Button type="submit" variant="contained">{t('search')}</Button>
      </Box>
      {loading && recipes.length === 0 && <Typography>{t('loadingRecipes')}</Typography>}
      {error && <Typography color="error">{t('error', { error })}</Typography>}
      {recipes.length === 0 && !loading ? (
        <Typography sx={{ textAlign: 'center', mt: 8, width: '100%' }}>{t('noRecipesFound')}</Typography>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: '1fr 1fr',
              md: '1fr 1fr 1fr',
              lg: '1fr 1fr 1fr 1fr'
            },
            gap: { xs: 2, sm: 3, md: 4 },
            width: '100%',
            maxWidth: 1400,
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
      {loading && recipes.length > 0 && <Typography sx={{ textAlign: 'center', mt: 2 }}>Loading more...</Typography>}
    </Box>
  );
}
