import React from 'react';
import { Card, CardContent, CardMedia, Typography, Box, CardActionArea, Rating } from '@mui/material';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

type RecipeCardProps = {
  recipe: {
    id: string;
    title: string;
    description?: string;
    imageUrl?: string;
    user?: { name?: string; email: string };
    averageRating?: number | null;
  };
};

const RecipeCard: React.FC<RecipeCardProps> = ({ recipe }) => {
  const { t } = useTranslation();
  return (
    <Card
      sx={{
        height: '100%',
        width: '100%',
        maxWidth: 320,
        display: 'flex',
        flexDirection: 'column',
        transition: 'box-shadow 0.2s, transform 0.2s',
        boxShadow: 2,
        cursor: 'pointer',
        '&:hover': {
          boxShadow: 8,
          transform: 'translateY(-4px) scale(1.02)',
        },
        p: 1.2,
      }}
    >
      <CardActionArea component={Link} to={`/recipes/${recipe.id}`} sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
        <CardContent sx={{ flexGrow: 1, width: '100%' }}>
          <Typography variant="h6" gutterBottom>{recipe.title}</Typography>
          {/* Show average rating if available */}
          {typeof recipe.averageRating === 'number' && (
            <Box display="flex" alignItems="center" mb={1}>
              <Rating value={recipe.averageRating} precision={0.1} readOnly size="small" />
              <Typography variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
                {recipe.averageRating.toFixed(1)}
              </Typography>
            </Box>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {recipe.description}
          </Typography>
          {recipe.imageUrl && (
            <Box mb={1} display="flex" justifyContent="center">
              <CardMedia
                component="img"
                image={recipe.imageUrl.startsWith('/uploads/') ? `${window.location.origin}${recipe.imageUrl}` : recipe.imageUrl}
                alt={recipe.title}
                sx={{ maxHeight: 200, maxWidth: '100%', objectFit: 'contain', borderRadius: 2, boxShadow: 1 }}
              />
            </Box>
          )}
          {recipe.user && (
            <Box sx={{ fontSize: '0.9em', color: 'text.secondary', mt: 1 }}>
              {t('by')}: {recipe.user.name || recipe.user.email}
            </Box>
          )}
        </CardContent>
      </CardActionArea>
    </Card>
  );
};

export default RecipeCard;
