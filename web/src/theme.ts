import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#D2691E', // Warm orange
      light: '#FF8C42',
      dark: '#A0522D',
      contrastText: '#fff',
    },
    secondary: {
      main: '#8B4513', // Saddle brown
      light: '#CD853F',
      dark: '#654321',
      contrastText: '#fff',
    },
    background: {
      default: '#FFF8F0', // Warm cream
      paper: '#FFFFFF',
    },
    text: {
      primary: '#2C1810', // Dark brown
      secondary: '#5D4037', // Medium brown
    },
    divider: '#E8D5C4', // Light warm gray
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontWeight: 700,
      color: '#2C1810',
    },
    h2: {
      fontWeight: 600,
      color: '#2C1810',
    },
    h3: {
      fontWeight: 600,
      color: '#2C1810',
    },
    h4: {
      fontWeight: 600,
      color: '#2C1810',
    },
    h5: {
      fontWeight: 600,
      color: '#2C1810',
    },
    h6: {
      fontWeight: 600,
      color: '#2C1810',
    },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: 'linear-gradient(135deg, #D2691E 0%, #FF8C42 100%)',
          boxShadow: '0 2px 20px rgba(210, 105, 30, 0.15)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          background: '#FFFFFF',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
          border: '1px solid #E8D5C4',
          transition: 'all 0.3s ease',
          '&:hover': {
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.12)',
            transform: 'translateY(-2px)',
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 600,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          '&:hover': {
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          },
        },
        contained: {
          background: 'linear-gradient(135deg, #D2691E 0%, #FF8C42 100%)',
          '&:hover': {
            background: 'linear-gradient(135deg, #A0522D 0%, #D2691E 100%)',
          },
        },
        outlined: {
          borderColor: '#D2691E',
          color: '#D2691E',
          '&:hover': {
            background: 'rgba(210, 105, 30, 0.08)',
            borderColor: '#A0522D',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          background: '#FFFFFF',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
          border: '1px solid #E8D5C4',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: '#D2691E',
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: '#D2691E',
            },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          fontWeight: 500,
        },
      },
    },
  },
}); 