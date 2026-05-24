export type RecipeLayout = 'tile' | 'list';

export const RECIPE_LAYOUT_STORAGE_KEY = 'metro-bistro:recipe-layout';

export function readRecipeLayout(): RecipeLayout {
  try {
    const stored = localStorage.getItem(RECIPE_LAYOUT_STORAGE_KEY);
    return stored === 'list' ? 'list' : 'tile';
  } catch {
    return 'tile';
  }
}

export function writeRecipeLayout(layout: RecipeLayout): void {
  try {
    localStorage.setItem(RECIPE_LAYOUT_STORAGE_KEY, layout);
  } catch {
    /* ignore */
  }
}
