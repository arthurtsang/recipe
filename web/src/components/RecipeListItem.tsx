import React from 'react';
import {
  Box,
  Typography,
  Rating,
  Chip,
  Tooltip,
  Paper,
} from '@mui/material';
import { Link } from 'react-router-dom';
import { AccessTime, Person, ChevronRight } from '@mui/icons-material';
import { recipeImageSrc } from '../utils/recipeImageSrc';

type RecipeListItemProps = {
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
  };
  showAuthor?: boolean;
};

function formatEstimatedTime(estimatedTime?: string): string {
  if (!estimatedTime) return 'Pending...';
  const minutes = parseInt(estimatedTime, 10);
  if (Number.isNaN(minutes)) return estimatedTime;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    return remainingMins === 0 ? `${hours}h` : `${hours}h ${remainingMins}m`;
  }
  return `${minutes}m`;
}

function difficultyMeta(difficulty?: string) {
  if (!difficulty) return { level: 'Undetermined', color: 'default' as const };
  const colorMap = {
    Easy: 'success' as const,
    Medium: 'warning' as const,
    Advanced: 'error' as const,
  };
  return {
    level: difficulty,
    color: colorMap[difficulty as keyof typeof colorMap] || ('warning' as const),
  };
}

const RecipeListItem: React.FC<RecipeListItemProps> = ({ recipe, showAuthor = true }) => {
  const estimatedTime = formatEstimatedTime(recipe.estimatedTime);
  const difficulty = difficultyMeta(recipe.difficulty);
  const imageSrc = recipe.imageUrl ? recipeImageSrc(recipe.imageUrl) : undefined;

  return (
    <Paper
      component={Link}
      to={`/recipes/${recipe.id}`}
      elevation={0}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        px: 2,
        py: 1.5,
        textDecoration: 'none',
        color: 'inherit',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        transition: 'box-shadow 0.2s, border-color 0.2s',
        '&:hover': {
          boxShadow: 2,
          borderColor: 'primary.light',
        },
      }}
    >
      {imageSrc ? (
        <Box
          component="img"
          src={imageSrc}
          alt=""
          sx={{
            width: 56,
            height: 56,
            borderRadius: 1.5,
            objectFit: 'cover',
            flexShrink: 0,
          }}
        />
      ) : (
        <Box
          sx={{
            width: 56,
            height: 56,
            borderRadius: 1.5,
            bgcolor: 'grey.100',
            flexShrink: 0,
          }}
        />
      )}

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="subtitle1"
          sx={{ fontWeight: 600, lineHeight: 1.3, mb: 0.25 }}
          noWrap
        >
          {recipe.title}
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          {typeof recipe.averageRating === 'number' && (
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Rating value={recipe.averageRating} precision={0.1} readOnly size="small" />
              <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                {recipe.averageRating.toFixed(1)}
              </Typography>
            </Box>
          )}

          <Tooltip title={recipe.timeReasoning || ''} placement="top" arrow>
            <Chip
              icon={<AccessTime sx={{ fontSize: 14 }} />}
              label={estimatedTime}
              size="small"
              variant="outlined"
              sx={{ height: 24 }}
            />
          </Tooltip>

          <Tooltip title={recipe.difficultyReasoning || ''} placement="top" arrow>
            <Chip label={difficulty.level} size="small" color={difficulty.color} sx={{ height: 24 }} />
          </Tooltip>

          {showAuthor && recipe.user && (
            <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
              <Person sx={{ fontSize: 14, mr: 0.25, color: 'text.secondary' }} />
              {(() => {
                const u = recipe.user!;
                const name = u.displayName ?? ((u.alias && u.alias.trim()) || u.name || u.email);
                const linkAlias = (u.alias && u.alias.trim()) || null;
                return linkAlias ? (
                  <Typography
                    component={Link}
                    to={`/users/${linkAlias}`}
                    variant="caption"
                    color="text.secondary"
                    noWrap
                    onClick={(e) => e.stopPropagation()}
                    sx={{ '&:hover': { textDecoration: 'underline' } }}
                  >
                    {name}
                  </Typography>
                ) : (
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {name}
                  </Typography>
                );
              })()}
            </Box>
          )}
        </Box>
      </Box>

      <ChevronRight sx={{ color: 'text.disabled', flexShrink: 0 }} />
    </Paper>
  );
};

export default RecipeListItem;
