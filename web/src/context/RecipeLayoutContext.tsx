import { createContext, useContext, useState, type ReactNode } from 'react';
import {
  readRecipeLayout,
  writeRecipeLayout,
  type RecipeLayout,
} from '../constants/recipeLayout';

interface RecipeLayoutContextValue {
  layout: RecipeLayout;
  setLayout: (layout: RecipeLayout) => void;
}

const RecipeLayoutContext = createContext<RecipeLayoutContextValue | null>(null);

export function RecipeLayoutProvider({ children }: { children: ReactNode }) {
  const [layout, setLayoutState] = useState<RecipeLayout>(readRecipeLayout);

  const setLayout = (next: RecipeLayout) => {
    setLayoutState(next);
    writeRecipeLayout(next);
  };

  return (
    <RecipeLayoutContext.Provider value={{ layout, setLayout }}>
      {children}
    </RecipeLayoutContext.Provider>
  );
}

export function useRecipeLayout() {
  const ctx = useContext(RecipeLayoutContext);
  if (!ctx) {
    throw new Error('useRecipeLayout must be used within RecipeLayoutProvider');
  }
  return ctx;
}
