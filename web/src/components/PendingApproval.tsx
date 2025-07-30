import {
  Box,
  Paper,
  Typography,
  Alert,
  Button,
} from '@mui/material';
import { HourglassEmpty } from '@mui/icons-material';

interface PendingApprovalProps {
  userEmail?: string;
}

export default function PendingApproval({ userEmail }: PendingApprovalProps) {
  const handleLogout = () => {
    window.location.href = '/logout';
  };

  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      minHeight="100vh"
      bgcolor="grey.50"
      p={3}
    >
      <Paper
        elevation={3}
        sx={{
          p: 4,
          maxWidth: 500,
          textAlign: 'center',
        }}
      >
        <Box mb={3}>
          <HourglassEmpty 
            sx={{ 
              fontSize: 64, 
              color: 'warning.main',
              mb: 2 
            }} 
          />
          <Typography variant="h4" gutterBottom>
            Account Pending Approval
          </Typography>
        </Box>

        <Alert severity="warning" sx={{ mb: 3, textAlign: 'left' }}>
          <Typography variant="body1" gutterBottom>
            Your account ({userEmail}) is waiting for administrator approval.
          </Typography>
          <Typography variant="body2">
            Please contact the administrator to enable your access to Metro Bistro.
          </Typography>
        </Alert>

        <Typography variant="body2" color="text.secondary" paragraph>
          Once approved, you'll be able to:
        </Typography>
        <Box component="ul" textAlign="left" mb={3}>
          <li>Create and share recipes</li>
          <li>Rate and comment on recipes</li>
          <li>Import recipes from external sources</li>
          <li>Use the AI-powered recipe assistant</li>
        </Box>

        <Button
          variant="outlined"
          onClick={handleLogout}
          sx={{ mt: 2 }}
        >
          Logout
        </Button>
      </Paper>
    </Box>
  );
} 