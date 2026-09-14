import { createTheme } from '@mui/material/styles';

// YourAmaryllis house + Secret Garden mark.
// Tokens from artifacts/youramaryllis/brand-standards.json — do not invent.
const field = '#36274C';
const fieldHover = '#43305A';
const page = '#E5DEEF';
const card = '#FFFFFF';
const text = '#2A242C';
const muted = '#6F6860';
const line = '#D9D3CC';
const onHeader = '#FFFFFF';

const wordmarkFont = '"Kaushan Script", cursive';
const headingFont = '"Libre Baskerville", Georgia, serif';
const bodyFont = '"Source Sans 3", system-ui, sans-serif';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: field,
      light: fieldHover,
      dark: '#2A1D3C',
      contrastText: onHeader,
    },
    secondary: {
      main: fieldHover,
      contrastText: onHeader,
    },
    background: {
      default: page,
      paper: card,
    },
    text: {
      primary: text,
      secondary: muted,
    },
    divider: line,
  },
  typography: {
    fontFamily: bodyFont,
    h1: { fontFamily: headingFont, fontWeight: 700, color: field },
    h2: { fontFamily: headingFont, fontWeight: 700, color: field },
    h3: { fontFamily: headingFont, fontWeight: 700, color: field },
    h4: { fontFamily: headingFont, fontWeight: 700, color: field },
    h5: { fontFamily: headingFont, fontWeight: 700, color: field },
    h6: { fontFamily: headingFont, fontWeight: 700, color: field },
    button: { fontFamily: bodyFont, fontWeight: 600, textTransform: 'none' },
    body1: { fontFamily: bodyFont },
    body2: { fontFamily: bodyFont },
    subtitle1: { fontFamily: bodyFont },
    subtitle2: { fontFamily: bodyFont },
    caption: { fontFamily: bodyFont },
    overline: { fontFamily: bodyFont },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: page,
          color: text,
          fontFamily: bodyFont,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: field,
          backgroundImage: 'none',
          color: onHeader,
          boxShadow: '0 2px 16px rgba(54, 39, 76, 0.18)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          background: card,
          boxShadow: '0 4px 20px rgba(54, 39, 76, 0.08)',
          border: `1px solid ${line}`,
          transition: 'all 0.3s ease',
          '&:hover': {
            boxShadow: '0 8px 30px rgba(54, 39, 76, 0.12)',
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
          fontFamily: bodyFont,
          fontWeight: 600,
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 2px 8px rgba(54, 39, 76, 0.16)',
          },
        },
        contained: {
          background: field,
          color: onHeader,
          '&:hover': {
            background: fieldHover,
          },
        },
        outlined: {
          borderColor: field,
          color: field,
          '&:hover': {
            background: 'rgba(54, 39, 76, 0.08)',
            borderColor: fieldHover,
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          background: card,
          boxShadow: '0 4px 20px rgba(54, 39, 76, 0.08)',
          border: `1px solid ${line}`,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: field,
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: field,
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
          fontFamily: bodyFont,
        },
      },
    },
  },
});

export const brand = {
  field,
  fieldHover,
  page,
  card,
  text,
  muted,
  line,
  onHeader,
  wordmarkFont,
  headingFont,
  bodyFont,
};
