import React from 'react';
import { Card, CardContent, CardMedia, Typography, Box, CardActionArea } from '@mui/material';
import { Link } from 'react-router-dom';

import { Person } from '@mui/icons-material';
import { recipeImageSrc } from '../utils/recipeImageSrc';

type RecipeCardProps = {
  recipe: {
    id: string;
    title: string;
    imageUrl?: string;
    user?: { name?: string | null; email: string; alias?: string | null; displayName?: string };
  };
};

const RecipeCard: React.FC<RecipeCardProps> = ({ recipe }) => {
  const imageSrc = recipe.imageUrl ? recipeImageSrc(recipe.imageUrl) : undefined;

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
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, lineHeight: 1.2 }}>
            {recipe.title}
          </Typography>

          {imageSrc && (
            <Box mb={1.5} display="flex" justifyContent="center">
              <CardMedia
                component="img"
                image={imageSrc}
                alt={recipe.title}
                sx={{ maxHeight: 200, maxWidth: '100%', objectFit: 'contain', borderRadius: 2, boxShadow: 1 }}
              />
            </Box>
          )}

          {recipe.user && (
            <Box display="flex" alignItems="center" sx={{ mt: 'auto', pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
              <Person sx={{ fontSize: 16, mr: 0.5, color: 'text.secondary' }} />
              {(() => {
                const u = recipe.user!;
                const displayName = u.displayName ?? ((u.alias && u.alias.trim()) || u.name || u.email);
                const linkAlias = (u.alias && u.alias.trim()) || null;
                return linkAlias ? (
                  <Link to={`/users/${linkAlias}`} style={{ textDecoration: 'none', color: 'inherit' }} onClick={(e) => e.stopPropagation()}>
                    <Typography variant="body2" color="text.secondary" sx={{ '&:hover': { textDecoration: 'underline' } }}>
                      {displayName}
                    </Typography>
                  </Link>
                ) : (
                  <Typography variant="body2" color="text.secondary">{displayName}</Typography>
                );
              })()}
            </Box>
          )}
        </CardContent>
      </CardActionArea>
    </Card>
  );
};

export default RecipeCard;