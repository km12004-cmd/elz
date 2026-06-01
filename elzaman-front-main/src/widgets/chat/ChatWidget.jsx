import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@/shared/api/client';
import { sendChatMessage } from '@/entities/chat/api';
import styles from './chatWidget.module.css';

const INITIAL_MESSAGES = Object.freeze([
  {
    id: 'welcome',
    role: 'assistant',
    content:
      'Салам! Я помощник El Zaman. Спросите про проект, песни, карточки или изучение кыргызского.\n\nСалам! Мен El Zaman жардамчысымын. Долбоор, ырлар, карточкалар же кыргыз тилин үйрөнүү жөнүндө сураңыз.',
  },
]);

function createMessage(role, content) {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
  };
}

function getErrorMessage(error) {
  if (error instanceof ApiError) {
    if (error.status === 503) return 'ИИ-сервис временно недоступен. Проверьте API key и настройки.';
    if (error.status === 429) {
      const detail = typeof error.data?.detail === 'string' ? error.data.detail : '';
      if (detail.toLowerCase().includes('quota')) {
        return 'У API-ключа нет доступной квоты или billing не включен. Чат подключен, но нужен ключ с рабочим балансом.';
      }
      return 'ИИ-сервис временно ограничил запросы. Попробуйте позже.';
    }
    if (error.status === 504) return 'ИИ-сервис отвечает слишком долго. Попробуйте еще раз.';
  }

  return 'Не удалось отправить сообщение. Попробуйте еще раз.';
}

function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [draft, setDraft] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const inputRef = useRef(null);
  const messagesRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!messagesRef.current) return;
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages, isSending, errorMessage]);

  const submitMessage = async (event) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || isSending) return;

    const userMessage = createMessage('user', text);
    const apiHistory = messages
      .filter((message) => message.id !== 'welcome')
      .map(({ role, content }) => ({ role, content }));

    setMessages((previousMessages) => [...previousMessages, userMessage]);
    setDraft('');
    setErrorMessage('');
    setIsSending(true);

    try {
      const response = await sendChatMessage({ message: text, history: apiHistory });
      setMessages((previousMessages) => [
        ...previousMessages,
        createMessage('assistant', response.answer),
      ]);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className={`${styles.chatRoot} ${isOpen ? styles.chatRootOpen : ''}`}>
      {isOpen ? (
        <section className={styles.panel} aria-label="El Zaman AI chat">
          <header className={styles.panelHeader}>
            <div>
              <p className={styles.kicker}>AI жардамчы</p>
              <h2 className={styles.title}>El Zaman AI</h2>
            </div>
            <button
              type="button"
              className={styles.closeButton}
              onClick={() => setIsOpen(false)}
              aria-label="Close chat">
              &times;
            </button>
          </header>

          <div ref={messagesRef} className={styles.messages} aria-live="polite">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`${styles.messageBubble} ${
                  message.role === 'user' ? styles.userBubble : styles.assistantBubble
                } ${message.id === 'welcome' ? styles.welcomeBubble : ''}`}>
                {message.content}
              </div>
            ))}
            {isSending ? (
              <div className={`${styles.messageBubble} ${styles.assistantBubble}`}>
                Думаю...
              </div>
            ) : null}
          </div>

          {errorMessage ? <p className={styles.errorText}>{errorMessage}</p> : null}

          <form className={styles.inputRow} onSubmit={submitMessage}>
            <input
              ref={inputRef}
              className={styles.input}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                if (errorMessage) setErrorMessage('');
              }}
              maxLength={1000}
              placeholder="Спросите про El Zaman"
              aria-label="Спросите про El Zaman"
              disabled={isSending}
            />
            <button
              type="submit"
              className={styles.sendButton}
              disabled={!draft.trim() || isSending}>
              Отпр.
            </button>
          </form>
        </section>
      ) : (
        <button
          type="button"
          className={styles.launchButton}
          onClick={() => setIsOpen(true)}
          aria-label="Open El Zaman AI chat">
          <span className={styles.launchIcon} aria-hidden="true" />
          <span>Спросить AI</span>
        </button>
      )}
    </div>
  );
}

export default ChatWidget;
