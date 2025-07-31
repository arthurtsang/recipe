import React from 'react';
import { Card, CardContent, CardMedia, Typography, Box, CardActionArea, Rating, Chip, Tooltip } from '@mui/material';
import { Link } from 'react-router-dom';

import { Restaurant, AccessTime, Person } from '@mui/icons-material';

type RecipeCardProps = {
  recipe: {
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
  };
};

const RecipeCard: React.FC<RecipeCardProps> = ({ recipe }) => {
  
  // Extract some useful information from the recipe
  const getIngredientCount = () => {
    if (!recipe.versions || recipe.versions.length === 0) return 0;
    const ingredients = recipe.versions[0].ingredients;
    // Split by newlines and filter out empty lines, then count
    const lines = ingredients.split('\n').filter(line => line.trim());
    // Count actual ingredients (lines that contain ingredients, not just empty or instruction-like lines)
    return lines.filter(line => {
      const trimmed = line.trim();
      // Skip lines that are just numbers, bullet points, or section headers
      return trimmed && 
             !/^\d+\.?\s*$/.test(trimmed) && // Skip just numbers
             !/^[•\-\*]\s*$/.test(trimmed) && // Skip just bullet points
             !/^(ingredients?|for|serves?|yield|makes?):/i.test(trimmed); // Skip headers
    }).length;
  };

  const getInstructionCount = () => {
    if (!recipe.versions || recipe.versions.length === 0) return 0;
    const instructions = recipe.versions[0].instructions;
    return instructions.split('\n').filter(line => line.trim()).length;
  };

  // Use AI-analyzed data if available, otherwise show pending status
  const getEstimatedTime = () => {
    if (recipe.estimatedTime) {
      const minutes = parseInt(recipe.estimatedTime);
      if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        const remainingMins = minutes % 60;
        if (remainingMins === 0) {
          return `${hours}h`;
        } else {
          return `${hours}h ${remainingMins}m`;
        }
      } else {
        return `${minutes}m`;
      }
    }
    return 'Pending...';
  };

  const getDifficulty = () => {
    if (recipe.difficulty) {
      const colorMap = {
        'Easy': 'success' as const,
        'Medium': 'warning' as const,
        'Advanced': 'error' as const
      };
      return { level: recipe.difficulty, color: colorMap[recipe.difficulty as keyof typeof colorMap] || 'warning' };
    }
    
    return { level: 'Undetermined', color: 'default' as const };
  };

  const ingredientCount = getIngredientCount();
  const instructionCount = getInstructionCount();
  const estimatedTime = getEstimatedTime();
  const difficulty = getDifficulty();

  // Debug logging
  console.log('RecipeCard Debug:', {
    title: recipe.title,
    versions: recipe.versions,
    ingredientCount,
    instructionCount,
    estimatedTime,
    difficulty: difficulty.level,
    recipeEstimatedTime: recipe.estimatedTime,
    recipeDifficulty: recipe.difficulty
  });

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
          
          {/* Show average rating if available */}
          {typeof recipe.averageRating === 'number' && (
            <Box display="flex" alignItems="center" mb={1.5}>
              <Rating value={recipe.averageRating} precision={0.1} readOnly size="small" />
              <Typography variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
                {recipe.averageRating.toFixed(1)}
              </Typography>
            </Box>
          )}

          {/* Recipe stats and info */}
          <Box sx={{ mb: 1.5 }}>
            <Box display="flex" gap={1} flexWrap="wrap" mb={1}>
              <Chip 
                icon={<Restaurant />} 
                label={`${ingredientCount} ingredients`} 
                size="small" 
                variant="outlined"
                color="primary"
              />
              <Tooltip 
                title={recipe.timeReasoning || 'No reasoning available'} 
                placement="top"
                arrow
              >
                <Chip 
                  icon={<AccessTime />} 
                  label={estimatedTime} 
                  size="small" 
                  variant="outlined"
                  color={estimatedTime === 'Pending...' ? 'default' : 'secondary'}
                />
              </Tooltip>
            </Box>
            <Tooltip 
              title={recipe.difficultyReasoning || 'No reasoning available'} 
              placement="top"
              arrow
            >
              <Chip 
                label={difficulty.level} 
                size="small" 
                color={difficulty.color}
                sx={{ mb: 1 }}
              />
            </Tooltip>
          </Box>

          {/* Description or fallback content */}
          {recipe.description ? (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, lineHeight: 1.4 }}>
              {recipe.description}
            </Typography>
          ) : (
            <Box sx={{ mb: 1.5 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                {instructionCount} steps • {ingredientCount} ingredients
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                Click to view full recipe details
              </Typography>
            </Box>
          )}

          {/* Image */}
          {recipe.imageUrl && (
            <Box mb={1.5} display="flex" justifyContent="center">
              <CardMedia
                component="img"
                image={recipe.imageUrl.startsWith('/uploads/') ? `${window.location.origin}${recipe.imageUrl}` : recipe.imageUrl}
                alt={recipe.title}
                sx={{ maxHeight: 200, maxWidth: '100%', objectFit: 'contain', borderRadius: 2, boxShadow: 1 }}
              />
            </Box>
          )}

          {/* Author info */}
          {recipe.user && (
            <Box display="flex" alignItems="center" sx={{ mt: 'auto', pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
              <Person sx={{ fontSize: 16, mr: 0.5, color: 'text.secondary' }} />
              <Typography variant="body2" color="text.secondary">
                {recipe.user.name || recipe.user.email}
              </Typography>
            </Box>
          )}
        </CardContent>
      </CardActionArea>
    </Card>
  );
};

export default RecipeCard;
