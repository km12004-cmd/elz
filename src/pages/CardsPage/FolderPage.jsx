import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  createFlashcardInFolder,
  deleteFlashcardInFolder,
  fetchFlashcardFolderDetail,
} from '../../api/flashcards';
import { useAuth } from '../../auth/useAuth';
import { extractErrorMessage } from '../../components/auth/extractErrorMessage';
import CreateCardModal from './CreateCardModal';
import Flashcard from './Flashcard';
import styles from './FolderPage.module.css';

function normalizeId(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }

  return null;
}

function FolderPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { folderId } = useParams();

  const [folder, setFolder] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [isCreateCardModalOpen, setIsCreateCardModalOpen] = useState(false);
  const [isCreatingCard, setIsCreatingCard] = useState(false);
  const [createCardError, setCreateCardError] = useState('');

  const [deletingCardId, setDeletingCardId] = useState(null);

  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  const normalizedFolderId = normalizeId(folderId);

  const loadFolder = useCallback(async () => {
    if (!normalizedFolderId) {
      setFolder(null);
      setLoadError('Invalid folder id');
      return;
    }

    setIsLoading(true);
    setLoadError('');

    try {
      const detail = await fetchFlashcardFolderDetail({ token, folderId: normalizedFolderId });
      setFolder(detail);
    } catch (error) {
      setFolder(null);
      setLoadError(extractErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [normalizedFolderId, token]);

  useEffect(() => {
    loadFolder();
  }, [loadFolder]);

  useEffect(() => {
    if (!actionError && !actionSuccess) return undefined;

    const timer = setTimeout(() => {
      setActionError('');
      setActionSuccess('');
    }, 3200);

    return () => clearTimeout(timer);
  }, [actionError, actionSuccess]);

  const clearMessages = () => {
    setActionError('');
    setActionSuccess('');
  };

  const handleCreateCard = async ({ frontText, backText }) => {
    if (!normalizedFolderId) {
      setCreateCardError('Invalid folder id');
      return false;
    }

    setCreateCardError('');
    setIsCreatingCard(true);
    clearMessages();

    try {
      const createdCard = await createFlashcardInFolder({
        token,
        folderId: normalizedFolderId,
        frontText,
        backText,
      });

      setFolder((previousFolder) => {
        if (!previousFolder) return previousFolder;

        const nextCards = [createdCard, ...(Array.isArray(previousFolder.cards) ? previousFolder.cards : [])];

        return {
          ...previousFolder,
          cards: nextCards,
          cardsCount: nextCards.length,
        };
      });

      setIsCreateCardModalOpen(false);
      setActionSuccess('Card created');
      return true;
    } catch (error) {
      setCreateCardError(extractErrorMessage(error));
      return false;
    } finally {
      setIsCreatingCard(false);
    }
  };

  const handleDeleteCard = async (cardId) => {
    const normalizedCardId = normalizeId(cardId);
    if (!normalizedFolderId || !normalizedCardId) return;

    const confirmed = window.confirm('Delete this card?');
    if (!confirmed) return;

    clearMessages();
    setDeletingCardId(normalizedCardId);

    try {
      await deleteFlashcardInFolder({
        token,
        folderId: normalizedFolderId,
        cardId: normalizedCardId,
      });

      setFolder((previousFolder) => {
        if (!previousFolder) return previousFolder;

        const nextCards = previousFolder.cards.filter(
          (card) => normalizeId(card.id) !== normalizedCardId,
        );

        return {
          ...previousFolder,
          cards: nextCards,
          cardsCount: nextCards.length,
        };
      });

      setActionSuccess('Card deleted');
    } catch (error) {
      setActionError(extractErrorMessage(error));
    } finally {
      setDeletingCardId(null);
    }
  };

  const cards = Array.isArray(folder?.cards) ? folder.cards : [];

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <button type="button" className={styles.ghostButton} onClick={() => navigate('/cards')}>
            Back
          </button>

          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => {
              setCreateCardError('');
              setIsCreateCardModalOpen(true);
            }}
            disabled={!folder}
          >
            Create Card
          </button>
        </div>

        <p className={styles.eyebrow}>Folder</p>
        <h2 className={styles.title}>{folder?.name ?? 'Folder'}</h2>
      </header>

      {actionError ? <p className={styles.errorText}>{actionError}</p> : null}
      {actionSuccess ? <p className={styles.successText}>{actionSuccess}</p> : null}
      {loadError ? <p className={styles.errorText}>{loadError}</p> : null}

      {isLoading ? <p className={styles.mutedText}>Loading cards...</p> : null}

      {!isLoading && folder && cards.length === 0 ? (
        <p className={styles.mutedText}>This folder has no cards yet</p>
      ) : null}

      <ul className={styles.cardsGrid}>
        {cards.map((card, index) => {
          const cardId = normalizeId(card.id);

          return (
            <li key={cardId ?? `folder-card-${index}`}>
              <Flashcard
                card={card}
                isDeleting={deletingCardId === cardId}
                onDelete={() => handleDeleteCard(cardId)}
              />
            </li>
          );
        })}
      </ul>

      {isCreateCardModalOpen ? (
        <CreateCardModal
          isSubmitting={isCreatingCard}
          errorMessage={createCardError}
          onClose={() => {
            if (isCreatingCard) return;
            setCreateCardError('');
            setIsCreateCardModalOpen(false);
          }}
          onCreate={handleCreateCard}
        />
      ) : null}
    </section>
  );
}

export default FolderPage;
