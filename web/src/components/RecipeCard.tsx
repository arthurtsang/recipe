import React from 'react';
import { Card, CardContent, CardMedia, Typography, Box, CardActionArea, Rating, Chip, Tooltip } from '@mui/material';
import { Link } from 'react-router-dom';

import { AccessTime, Person } from '@mui/icons-material';
import { recipeImageSrc } from '../utils/recipeImageSrc';

type RecipeCardProps = {
  recipe: {
    id: string;
    title: string;
    description?: string;
    imageUrl?: string;
    user?: { name?: string | null; email: string; alias?: string | null; displayName?: string };
    averageRating?: number | null;
    estimatedTime?: string;
    difficulty?: string;
    timeReasoning?: string;
    difficultyReasoning?: string;
    versions?: Array<{
      ingredients: string;
      instructions: string;
    }>;
  };
};

function formatEstimatedTime(estimatedTime?: string): string | null {
  if (!estimatedTime || !String(estimatedTime).trim()) return null;
  const minutes = parseInt(String(estimatedTime), 10);
  if (Number.isNaN(minutes) || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  if (hours > 0 && remainingMins === 0) return `${hours}h 0m`;
  if (hours > 0) return `${hours}h ${remainingMins}m`;
  return `0h ${minutes}m`;
}

const RecipeCard: React.FC<RecipeCardProps> = ({ recipe }) => {
  const getIngredientCount = () => {
    if (!recipe.versions || recipe.versions.length === 0) return 0;
    const ingredients = recipe.versions[0].ingredients || '';
    const lines = ingredients.split('\n').filter(line => line.trim());
    return lines.filter(line => {
      const trimmed = line.trim();
      return trimmed &&
             !/^\d+\.?\s*$/.test(trimmed) &&
             !/^[\u2022\-\*]\s*$/.test(trimmed) &&
             !/^(ingredients?|for|serves?|yield|makes?):/i.test(trimmed);
    }).length;
  };

  const getInstructionCount = () => {
    if (!recipe.versions || recipe.versions.length === 0) return 0;
    const instructions = recipe.versions[0].instructions || '';
    return instructions.split('\n').filter(line => line.trim()).length;
  };

  const ingredientCount = getIngredientCount();
  const instructionCount = getInstructionCount();
  const estimatedTime = formatEstimatedTime(recipe.estimatedTime);

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

          {typeof recipe.averageRating === 'number' && (
            <Box display="flex" alignItems="center" mb={1.5}>
              <Rating value={recipe.averageRating} precision={0.1} readOnly size="small" />
              <Typography variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
                {recipe.averageRating.toFixed(1)}
              </Typography>
            </Box>
          )}

          {estimatedTime && (
            <Box sx={{ mb: 1.5 }}>
              <Tooltip title={recipe.timeReasoning || ''} placement="top" arrow>
                <Chip icon={<AccessTime />} label={estimatedTime} size="small" variant="outlined" color="primary" />
              </Tooltip>
            </Box>
          )}

          <Box sx={{ mb: 1.5 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              {instructionCount} steps • {ingredientCount} ingredients
            </Typography>
            {recipe.description ? (
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.4 }}>
                {recipe.description}
              </Typography>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                Click to view full recipe details
              </Typography>
            )}
          </Box>

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
