import React, { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  TextField,
  Button,
  Typography,
  Paper,
  IconButton,
  Avatar,
  CircularProgress,
  Chip,
  Divider,
} from '@mui/material';
import {
  Send as SendIcon,
  Close as CloseIcon,
  SmartToy as BotIcon,
  Person as PersonIcon,
} from '@mui/icons-material';


interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  recipes?: any[];
}

interface RecipeChatProps {
  open: boolean;
  onClose: () => void;
}

const RecipeChat: React.FC<RecipeChatProps> = ({ open, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: "Hi! I'm your recipe assistant. I can help you find recipes, suggest ingredients, answer cooking questions, and more. What would you like to know?",
      sender: 'bot',
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText.trim(),
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/recipes/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question: inputText.trim() }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();
      
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: data.answer,
        sender: 'bot',
        timestamp: new Date(),
        recipes: data.recipes || [],
      };

      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: 'Sorry, I encountered an error. Please try again.',
        sender: 'bot',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const suggestedQuestions = [
    "What recipes do you have with chicken?",
    "Show me vegetarian recipes",
    "What can I make with eggs and cheese?",
    "How do I cook pasta?",
    "What are some quick dinner ideas?",
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          height: '80vh',
          maxHeight: '600px',
          borderRadius: 3,
        },
      }}
    >
      <DialogTitle sx={{ 
        pb: 1, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        background: 'linear-gradient(135deg, #D2691E 0%, #FF8C42 100%)',
        color: 'white',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <BotIcon />
          <Typography variant="h6">Recipe Assistant</Typography>
        </Box>
        <IconButton onClick={onClose} sx={{ color: 'white' }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Messages Area */}
        <Box sx={{ 
          flex: 1, 
          overflow: 'auto', 
          p: 2, 
          display: 'flex', 
          flexDirection: 'column', 
          gap: 2,
          background: '#FFF8F0',
        }}>
          {messages.map((message) => (
            <Box
              key={message.id}
              sx={{
                display: 'flex',
                justifyContent: message.sender === 'user' ? 'flex-end' : 'flex-start',
                gap: 1,
              }}
            >
              {message.sender === 'bot' && (
                <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>
                  <BotIcon fontSize="small" />
                </Avatar>
              )}
              
              <Paper
                sx={{
                  p: 2,
                  maxWidth: '70%',
                  background: message.sender === 'user' 
                    ? 'linear-gradient(135deg, #D2691E 0%, #FF8C42 100%)'
                    : 'white',
                  color: message.sender === 'user' ? 'white' : 'inherit',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                }}
              >
                <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                  {message.text}
                </Typography>
                
                {message.recipes && message.recipes.length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                      Related Recipes:
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {message.recipes.map((recipe: any) => (
                        <Chip
                          key={recipe.id}
                          label={recipe.title}
                          size="small"
                          sx={{
                            background: 'rgba(210, 105, 30, 0.1)',
                            color: '#D2691E',
                            '&:hover': {
                              background: 'rgba(210, 105, 30, 0.2)',
                            },
                          }}
                        />
                      ))}
                    </Box>
                  </Box>
                )}
                
                <Typography 
                  variant="caption" 
                  sx={{ 
                    display: 'block', 
                    mt: 1, 
                    opacity: 0.7,
                    textAlign: 'right',
                  }}
                >
                  {message.timestamp.toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </Typography>
              </Paper>
              
              {message.sender === 'user' && (
                <Avatar sx={{ bgcolor: 'secondary.main', width: 32, height: 32 }}>
                  <PersonIcon fontSize="small" />
                </Avatar>
              )}
            </Box>
          ))}
          
          {isLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'flex-start', gap: 1 }}>
              <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>
                <BotIcon fontSize="small" />
              </Avatar>
              <Paper sx={{ p: 2, background: 'white' }}>
                <CircularProgress size={20} />
              </Paper>
            </Box>
          )}
          
          <div ref={messagesEndRef} />
        </Box>

        {/* Suggested Questions */}
        {messages.length === 1 && (
          <Box sx={{ p: 2, background: '#F5F5F5' }}>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
              Try asking:
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {suggestedQuestions.map((question, index) => (
                <Chip
                  key={index}
                  label={question}
                  size="small"
                  onClick={() => setInputText(question)}
                  sx={{
                    cursor: 'pointer',
                    '&:hover': {
                      background: 'rgba(210, 105, 30, 0.1)',
                    },
                  }}
                />
              ))}
            </Box>
          </Box>
        )}

        <Divider />

        {/* Input Area */}
        <Box sx={{ p: 2, background: 'white' }}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              fullWidth
              multiline
              maxRows={3}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask me about recipes, ingredients, cooking tips..."
              disabled={isLoading}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                },
              }}
            />
            <Button
              variant="contained"
              onClick={handleSend}
              disabled={!inputText.trim() || isLoading}
              sx={{
                minWidth: 'auto',
                px: 2,
                borderRadius: 2,
              }}
            >
              <SendIcon />
            </Button>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default RecipeChat; 