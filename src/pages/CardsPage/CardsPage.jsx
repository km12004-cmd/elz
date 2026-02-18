import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createFlashcardFolder,
  deleteFlashcardFolder,
  fetchFlashcardFolders,
} from '../../api/flashcards';
import { useAuth } from '../../auth/useAuth';
import { extractErrorMessage } from '../../components/auth/extractErrorMessage';
import CreateFolderModal from './CreateFolderModal';
import styles from './CardsPage.module.css';

const FOLDER_NAME_MAX_LENGTH = 60;

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeId(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }

  return null;
}

function countCards(folder) {
  if (typeof folder?.cardsCount === 'number') return folder.cardsCount;
  if (Array.isArray(folder?.cards)) return folder.cards.length;
  return 0;
}

function CardsPage() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const [folders, setFolders] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [createError, setCreateError] = useState('');

  const [deletingFolderId, setDeletingFolderId] = useState(null);

  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  const loadFolders = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');

    try {
      const items = await fetchFlashcardFolders({ token });
      setFolders(items);
    } catch (error) {
      setFolders([]);
      setLoadError(extractErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

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

  const handleCreateFolder = async (rawName) => {
    const normalizedName = normalizeText(rawName);

    if (!normalizedName) {
      setCreateError('Folder name is required');
      return false;
    }

    if (normalizedName.length > FOLDER_NAME_MAX_LENGTH) {
      setCreateError(`Folder name must be ${FOLDER_NAME_MAX_LENGTH} characters or less`);
      return false;
    }

    const isDuplicate = folders.some(
      (folder) => normalizeText(folder.name).toLowerCase() === normalizedName.toLowerCase(),
    );

    if (isDuplicate) {
      setCreateError('A folder with this name already exists');
      return false;
    }

    setIsCreatingFolder(true);
    setCreateError('');
    clearMessages();

    try {
      const createdFolder = await createFlashcardFolder({
        token,
        name: normalizedName,
      });

      setFolders((previousFolders) => [createdFolder, ...previousFolders]);
      setActionSuccess('Folder created');
      setIsCreateModalOpen(false);
      return true;
    } catch (error) {
      setCreateError(extractErrorMessage(error));
      return false;
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleDeleteFolder = async (folder) => {
    const folderId = normalizeId(folder?.id);
    if (!folderId) return;

    const confirmed = window.confirm(`Delete folder "${folder.name}"?`);
    if (!confirmed) return;

    clearMessages();
    setDeletingFolderId(folderId);

    try {
      await deleteFlashcardFolder({ token, folderId });
      setFolders((previousFolders) =>
        previousFolders.filter((item) => normalizeId(item.id) !== folderId),
      );
      setActionSuccess('Folder deleted');
    } catch (error) {
      setActionError(extractErrorMessage(error));
    } finally {
      setDeletingFolderId(null);
    }
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Cards</p>
          <h2 className={styles.title}>My Folders</h2>
          <p className={styles.subtitle}>Open a folder to create and review your flashcards.</p>
        </div>

        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => {
            setCreateError('');
            setIsCreateModalOpen(true);
          }}
        >
          Create Folder
        </button>
      </header>

      {actionError ? <p className={styles.errorText}>{actionError}</p> : null}
      {actionSuccess ? <p className={styles.successText}>{actionSuccess}</p> : null}
      {loadError ? <p className={styles.errorText}>{loadError}</p> : null}

      {isLoading ? <p className={styles.mutedText}>Loading folders...</p> : null}
      {!isLoading && folders.length === 0 ? (
        <p className={styles.mutedText}>You do not have any folders yet</p>
      ) : null}

      <ul className={styles.folderGrid}>
        {folders.map((folder, index) => {
          const folderId = normalizeId(folder.id);
          const isDeleting = deletingFolderId === folderId;

          return (
            <li key={folderId ?? `folder-${index}`}>
              <article className={styles.folderCard}>
                <button
                  type="button"
                  className={styles.folderMainButton}
                  onClick={() => {
                    if (!folderId) return;
                    navigate(`/cards/${folderId}`);
                  }}
                  disabled={!folderId}
                >
                  <p className={styles.folderName}>{folder.name}</p>
                  <p className={styles.folderMeta}>{countCards(folder)} cards</p>
                </button>

                <button
                  type="button"
                  className={styles.deleteButton}
                  onClick={() => handleDeleteFolder(folder)}
                  disabled={isDeleting || !folderId}
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </article>
            </li>
          );
        })}
      </ul>

      {isCreateModalOpen ? (
        <CreateFolderModal
          isSubmitting={isCreatingFolder}
          errorMessage={createError}
          maxLength={FOLDER_NAME_MAX_LENGTH}
          onClose={() => {
            if (isCreatingFolder) return;
            setIsCreateModalOpen(false);
            setCreateError('');
          }}
          onCreate={handleCreateFolder}
        />
      ) : null}
    </section>
  );
}

export default CardsPage;
