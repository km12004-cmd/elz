import { apiRequest } from '@/shared/api/client';

export async function createTelegramCheckoutLink({ token } = {}) {
  return apiRequest('/api/subscriptions/telegram-link', {
    method: 'POST',
    token,
  });
}
