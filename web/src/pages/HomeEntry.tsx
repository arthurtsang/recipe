import { useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import RecipeList from './RecipeList';
import { RECIPE_APP_HOME_MY_REDIRECT_ONCE_KEY, type RecipeAppHomeLandingState } from '../constants/homeRouting';

interface User {
  id: string;
  alias?: string | null;
}

interface HomeEntryProps {
  authResolved: boolean;
  user: User | null;
}

/**
 * Authenticated `/` redirects once per tab session to My recipes (right after OAuth or first open).
 * Once that landing is acknowledged, `/` shows the community list again (logo / Browse all recipes).
 */
export default function HomeEntry({ authResolved, user }: HomeEntryProps) {
  const navigate = useNavigate();
  const alias = user?.alias?.trim() ?? '';

  useLayoutEffect(() => {
    if (!authResolved || !user || !alias) return;
    try {
      if (sessionStorage.getItem(RECIPE_APP_HOME_MY_REDIRECT_ONCE_KEY)) return;
    } catch {
      return;
    }
    navigate(`/users/${encodeURIComponent(alias)}`, {
      replace: true,
      state: { recipeAppHomeLanding: true } satisfies RecipeAppHomeLandingState,
    });
  }, [authResolved, user, alias, navigate]);

  if (!authResolved) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 320 }}>
        <CircularProgress />
      </Box>
    );
  }

  let waitingForLanding = Boolean(user && alias);
  try {
    waitingForLanding =
      Boolean(user && alias) && !sessionStorage.getItem(RECIPE_APP_HOME_MY_REDIRECT_ONCE_KEY);
  } catch {
    waitingForLanding = false;
  }

  if (waitingForLanding) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 320 }}>
        <CircularProgress />
      </Box>
    );
  }

  return <RecipeList />;
}
