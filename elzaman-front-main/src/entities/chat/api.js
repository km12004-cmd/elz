import { apiRequest } from '@/shared/api/client';

const CHAT_BASE_PATH = '/api/chat';
const MAX_HISTORY_MESSAGES = 6;

function normalizeHistoryMessage(message) {
  if (!message || typeof message !== 'object') return null;
  const role = typeof message.role === 'string' ? message.role.trim().toLowerCase() : '';
  const content = typeof message.content === 'string' ? message.content.trim() : '';

  if (!['user', 'assistant'].includes(role) || !content) return null;
  return { role, content };
}

export async function sendChatMessage({ message, history = [] } = {}) {
  const normalizedMessage = typeof message === 'string' ? message.trim() : '';
  if (!normalizedMessage) throw new Error('Message is required');

  const normalizedHistory = Array.isArray(history)
    ? history.map(normalizeHistoryMessage).filter(Boolean).slice(-MAX_HISTORY_MESSAGES)
    : [];

  const data = await apiRequest(`${CHAT_BASE_PATH}/messages`, {
    method: 'POST',
    body: {
      message: normalizedMessage,
      history: normalizedHistory,
    },
  });

  const answer = typeof data?.answer === 'string' ? data.answer.trim() : '';
  if (!answer) throw new Error('AI service returned an empty response');

  return {
    ok: data?.ok !== false,
    answer,
  };
}
