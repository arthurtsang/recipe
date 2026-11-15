import React from 'react';
import {
  Box,
  Typography,
  Paper,
} from '@mui/material';
import { Link } from 'react-router-dom';
import { Person, ChevronRight } from '@mui/icons-material';
import { recipeImageSrc } from '../utils/recipeImageSrc';

type RecipeListItemProps = {
  recipe: {
    id: string;
    title: string;
    imageUrl?: string;
    user?: { name?: string | null; email: string; alias?: string | null; displayName?: string };
  };
  showAuthor?: boolean;
};

const RecipeListItem: React.FC<RecipeListItemProps> = ({ recipe, showAuthor = true }) => {
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
        <Box component="img" src={imageSrc} alt="" sx={{ width: 56, height: 56, borderRadius: 1.5, objectFit: 'cover', flexShrink: 0 }} />
      ) : (
        <Box sx={{ width: 56, height: 56, borderRadius: 1.5, bgcolor: 'grey.100', flexShrink: 0 }} />
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.3 }} noWrap>
          {recipe.title}
        </Typography>
        {showAuthor && recipe.user && (
          <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0, mt: 0.25 }}>
            <Person sx={{ fontSize: 14, mr: 0.25, color: 'text.secondary' }} />
            {(() => {
              const u = recipe.user!;
              const name = u.displayName ?? ((u.alias && u.alias.trim()) || u.name || u.email);
              const linkAlias = (u.alias && u.alias.trim()) || null;
              return linkAlias ? (
                <Typography component={Link} to={`/users/${linkAlias}`} variant="caption" color="text.secondary" noWrap onClick={(e) => e.stopPropagation()} sx={{ '&:hover': { textDecoration: 'underline' } }}>
                  {name}
                </Typography>
              ) : (
                <Typography variant="caption" color="text.secondary" noWrap>{name}</Typography>
              );
            })()}
          </Box>
        )}
      </Box>
      <ChevronRight sx={{ color: 'text.disabled', flexShrink: 0 }} />
    </Paper>
  );
};

export default RecipeListItem;