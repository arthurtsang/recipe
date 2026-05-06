/** After this is set for the tab (only when arriving from `/` landing), authenticated `/` shows the community recipe list instead of redirecting again. Cleared when the visitor logs out. */
export const RECIPE_APP_HOME_MY_REDIRECT_ONCE_KEY = 'metro-bistro:home-my-recipes-once-per-tab';

export type RecipeAppHomeLandingState = { recipeAppHomeLanding?: true };
