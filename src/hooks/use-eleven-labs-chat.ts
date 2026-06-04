import type { DisconnectionDetails } from '@elevenlabs/react';
import {
  useConversation,
  useConversationControls,
  useConversationInput,
  useConversationMode,
  useConversationStatus,
} from '@elevenlabs/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useChatContext } from '../contexts/chat-context';
import type { AudioManager, ConnectionState, Message } from '../models';

type ConversationMessagePayload = {
  message: string;
  role: 'user' | 'agent';
  source: 'user' | 'ai';
  event_id?: number;
};

export interface UseElevenLabsChatReturn {
  // State
  messages: Message[];
  inputText: string;
  isConnected: boolean;
  connectionState: ConnectionState;
  selectedAgentId: string;
  error: string;

  // Actions
  setInputText: (text: string) => void;
  setSelectedAgentId: (id: string) => void;
  sendMessage: () => Promise<void>;
  connectToAgent: () => Promise<void>;
  disconnect: () => void;
  resetToIntro: () => void;
  resetToIntroWithClearHistory: () => void;
  startNewConversation: () => Promise<void>;
  toggleRecording: () => Promise<void>;
  handleAcceptTerms: () => Promise<void>;
  handleCancelTerms: () => void;

  // Utilities
  handleKeyPress: (e: React.KeyboardEvent) => void;

  // Audio manager instance
  audioManager: AudioManager;
}

const getBackendUrl = (): string => {
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL;
  }

  if (import.meta.env.VITE_APP_URL) {
    return import.meta.env.VITE_APP_URL;
  }

  if (typeof window !== 'undefined') {
    const currentUrl = window.location.origin;

    if (currentUrl.includes('localhost:5173')) {
      return 'http://localhost:3001';
    }

    return currentUrl;
  }

  return import.meta.env.PROD ? '' : 'http://localhost:3001';
};

export const useElevenLabsChat = (): UseElevenLabsChatReturn => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [error, setError] = useState<string>('');

  const { setFlowStep } = useChatContext();
  const pendingReconnectRef = useRef(false);
  const isStartingRef = useRef(false);
  const backendUrl = getBackendUrl();

  useConversation({
    onConnect: () => {
      console.log('[ElevenLabs] connected');
      setError('');
    },
    onDisconnect: (details: DisconnectionDetails) => {
      console.log('[ElevenLabs] disconnected', details);
      if (details.reason === 'error') {
        setError(details.message);
      }
    },
    onError: (message: string) => {
      console.error('[ElevenLabs] error', message);
      setError(message);
    },
    onMessage: ({ message, role }: ConversationMessagePayload) => {
      console.log('[ElevenLabs] message', { role, message });
      if (!message) {
        return;
      }

      const newMessage: Message = {
        id:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : Date.now().toString(),
        text: message,
        sender: role === 'agent' ? 'agent' : 'user',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, newMessage]);
    },
  });

  const { startSession, endSession, sendUserMessage } =
    useConversationControls();
  const { status } = useConversationStatus();
  const { isMuted, setMuted } = useConversationInput();
  const { isSpeaking } = useConversationMode();

  const connectionState: ConnectionState =
    status === 'connected'
      ? 'connected'
      : status === 'connecting'
        ? 'connecting'
        : 'disconnected';
  const isConnected = status === 'connected';

  const audioManager: AudioManager = {
    isRecording: isConnected && !isMuted,
    isPlaying: isSpeaking,
    startRecording: async () => {
      setMuted(false);
    },
    stopRecording: () => {
      setMuted(true);
    },
    playAudio: async () => {},
    stopAudio: () => {},
  };

  const initializeService = useCallback(async () => {
    try {
      setError('');
      const response = await fetch(`${backendUrl}/api/agents`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch agents');
      }

      const agentList: Array<{ agentId: string; name?: string }> =
        await response.json();

      if (agentList.length > 0 && !selectedAgentId) {
        const preferred =
          agentList.find(
            (a) => a.agentId === 'agent_2101k4yxrs7ge83syg5n15y0wbpn',
          ) ?? agentList[0];
        setSelectedAgentId(preferred.agentId);
      }
    } catch {
      setError(
        'Failed to initialize service. Please check your backend connection.',
      );
    }
  }, [backendUrl, selectedAgentId]);

  // Initialize service on hook mount
  useEffect(() => {
    initializeService();
  }, [initializeService]);

  const connectToAgent = useCallback(async () => {
    if (!selectedAgentId) {
      setError('Please select an agent');
      return;
    }

    if (isStartingRef.current || status !== 'disconnected') {
      console.log('[ElevenLabs] skip connect, already', {
        starting: isStartingRef.current,
        status,
      });
      return;
    }

    isStartingRef.current = true;

    try {
      setError('');

      const response = await fetch(
        `${backendUrl}/api/agents/${selectedAgentId}/connect`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new Error('Failed to get signed URL');
      }

      const signedUrl = await response.text();
      console.log('[ElevenLabs] got signedUrl, starting session');

      await startSession({
        signedUrl,
      });
    } catch (err) {
      console.error('[ElevenLabs] startSession failed', err);
      setError('Failed to connect to agent');
    } finally {
      isStartingRef.current = false;
    }
  }, [backendUrl, selectedAgentId, startSession, status]);

  useEffect(() => {
    if (pendingReconnectRef.current && status === 'disconnected') {
      pendingReconnectRef.current = false;
      void (async () => {
        await connectToAgent();
      })();
    }
  }, [connectToAgent, status]);

  const sendMessage = useCallback(async () => {
    if (!inputText.trim() || !isConnected) {
      return;
    }

    const trimmedInput = inputText.trim();

    const userMessage: Message = {
      id: Date.now().toString(),
      text: trimmedInput,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);

    try {
      sendUserMessage(trimmedInput);
      setInputText('');
    } catch {
      setError('Failed to send message');
    }
  }, [inputText, isConnected, sendUserMessage]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage],
  );

  const disconnect = useCallback(() => {
    pendingReconnectRef.current = false;
    endSession();
  }, [endSession]);

  const resetToIntro = useCallback(() => {
    // Disconnect if currently connected
    if (isConnected) {
      disconnect();
    }
    // Reset state but keep messages to preserve conversation history
    setInputText('');
    setError('');
    setFlowStep('intro');
  }, [isConnected, disconnect, setFlowStep]);

  const resetToIntroWithClearHistory = useCallback(() => {
    // Disconnect if currently connected
    if (isConnected) {
      disconnect();
    }
    // Reset all state including messages
    setMessages([]);
    setInputText('');
    setError('');
    setFlowStep('intro');
  }, [isConnected, disconnect, setFlowStep]);

  const startNewConversation = useCallback(async () => {
    // Reset the conversation state
    setMessages([]);
    setInputText('');
    setError('');

    // Disconnect if currently connected
    if (status !== 'disconnected') {
      pendingReconnectRef.current = true;
      disconnect();
      return;
    }

    // Reconnect to start fresh conversation
    await connectToAgent();
  }, [connectToAgent, disconnect, status]);

  const toggleRecording = useCallback(async () => {
    if (!isConnected) {
      setError('Please connect to an agent first');
      return;
    }

    try {
      if (isMuted) {
        setMuted(false);
      } else {
        setMuted(true);
      }

      setError('');
    } catch {
      const errorMessage =
        'Failed to access microphone. Please check permissions.';
      setError(errorMessage);
    }
  }, [isConnected, isMuted, setMuted]);

  const handleAcceptTerms = useCallback(async () => {
    setFlowStep('chat');
    // Initialize the service and connect automatically
    await connectToAgent();
  }, [connectToAgent, setFlowStep]);

  const handleCancelTerms = useCallback(() => {
    setFlowStep('intro');
  }, [setFlowStep]);

  return {
    // State
    messages,
    inputText,
    isConnected,
    connectionState,
    selectedAgentId,
    error,

    // Actions
    setInputText,
    setSelectedAgentId,
    sendMessage,
    connectToAgent,
    disconnect,
    resetToIntro,
    resetToIntroWithClearHistory,
    startNewConversation,
    toggleRecording,
    handleAcceptTerms,
    handleCancelTerms,

    // Utilities
    handleKeyPress,

    // Audio manager instance
    audioManager,
  };
};
