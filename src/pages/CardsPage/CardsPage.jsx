import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createFlashcardFolder,
  deleteFlashcardFolder,
  fetchFlashcardFolders,
} from '../../api/flashcards';
import { useAuth } from '../../auth/useAuth';
import { extractErrorMessage } from '../../components/auth/extractErrorMessage';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Skeleton from '../../components/ui/Skeleton';
import Toast from '../../components/ui/Toast';
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
  const [folderToDelete, setFolderToDelete] = useState(null);
  const [openFolderMenuId, setOpenFolderMenuId] = useState(null);

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
      setLoadError(extractErrorMessage(error, { context: 'cards' }));
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

  useEffect(() => {
    if (!openFolderMenuId) return undefined;

    const handlePointerDown = (event) => {
      if (!(event.target instanceof Element)) {
        setOpenFolderMenuId(null);
        return;
      }

      if (event.target.closest('[data-folder-menu-root="true"]')) return;
      setOpenFolderMenuId(null);
    };

    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      setOpenFolderMenuId(null);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openFolderMenuId]);

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
      setCreateError(extractErrorMessage(error, { context: 'cards' }));
      return false;
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const openDeleteDialog = (folder) => {
    if (!normalizeId(folder?.id)) return;
    setFolderToDelete(folder);
  };

  const confirmDeleteFolder = async () => {
    const folderId = normalizeId(folderToDelete?.id);
    if (!folderId) {
      setFolderToDelete(null);
      return;
    }

    clearMessages();
    setDeletingFolderId(folderId);

    try {
      await deleteFlashcardFolder({ token, folderId });
      setFolders((previousFolders) =>
        previousFolders.filter((item) => normalizeId(item.id) !== folderId),
      );
      setActionSuccess('Folder deleted');
      setOpenFolderMenuId(null);
      setFolderToDelete(null);
    } catch (error) {
      setActionError(extractErrorMessage(error, { context: 'cards' }));
    } finally {
      setDeletingFolderId(null);
    }
  };

  const folderToDeleteId = normalizeId(folderToDelete?.id);

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Cards</p>
          <h2 className={styles.title}>My Folders</h2>
          <p className={styles.subtitle}>Build compact decks and review your vocabulary faster.</p>
        </div>

        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => {
            setCreateError('');
            setIsCreateModalOpen(true);
          }}
          title="Create a new folder"
        >
          + Create Folder
        </button>
      </header>

      <div className={styles.statusRow}>
        <span className={styles.badge}>{folders.length} folders</span>
      </div>

      {loadError ? <p className={styles.errorText}>{loadError}</p> : null}

      {isLoading ? (
        <>
          <div className={styles.loadingRow}>
            <LoadingSpinner size="sm" />
            <span>Loading folders...</span>
          </div>
          <ul className={styles.folderGrid}>
            {Array.from({ length: 6 }).map((_, index) => (
              <li key={`folder-skeleton-${index}`}>
                <article className={styles.folderCard}>
                  <Skeleton className={styles.skeletonIcon} />
                  <Skeleton className={styles.skeletonTitle} />
                  <Skeleton className={styles.skeletonMeta} />
                </article>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {!isLoading && folders.length === 0 ? (
        <EmptyState
          kind="folder"
          title="No folders created"
          description="Create your first folder to organize cards by topic and keep sessions focused."
          actionLabel="Create folder"
          onAction={() => {
            setCreateError('');
            setIsCreateModalOpen(true);
          }}
        />
      ) : null}

      {!isLoading && folders.length > 0 ? (
        <ul className={styles.folderGrid}>
          {folders.map((folder, index) => {
            const folderId = normalizeId(folder.id);
            const isDeleting = deletingFolderId === folderId;

            return (
              <li key={folderId ?? `folder-${index}`}>
                <article className={styles.folderCard}>
                  <div className={styles.folderTopRow}>
                    <span className={styles.folderIcon} aria-hidden="true">
                      📁
                    </span>
                    <span className={styles.folderArrow} aria-hidden="true">
                      ↗
                    </span>
                  </div>

                  <button
                    type="button"
                    className={styles.folderMainButton}
                    onClick={() => {
                      if (!folderId) return;
                      navigate(`/cards/${folderId}`);
                    }}
                    disabled={!folderId}
                    title="Open folder"
                  >
                    <p className={styles.folderName}>{folder.name}</p>
                    <p className={styles.folderMeta}>{countCards(folder)} cards</p>
                  </button>

                  <div className={styles.folderActions}>
                    <div className={styles.folderMenu} data-folder-menu-root="true">
                      <button
                        type="button"
                        className={styles.folderMenuTrigger}
                        onClick={() =>
                          setOpenFolderMenuId((previous) => (previous === folderId ? null : folderId))
                        }
                        disabled={isDeleting || !folderId}
                        aria-expanded={Boolean(folderId && openFolderMenuId === folderId)}
                        aria-haspopup="menu"
                        aria-label={`Open actions for ${folder.name}`}
                        title="Folder actions"
                      >
                        ⋯
                      </button>

                      {folderId && openFolderMenuId === folderId ? (
                        <div className={styles.folderMenuDropdown} role="menu">
                          <button
                            type="button"
                            className={styles.folderMenuItemDanger}
                            onClick={() => {
                              setOpenFolderMenuId(null);
                              openDeleteDialog(folder);
                            }}
                            disabled={isDeleting}
                            role="menuitem"
                          >
                            {isDeleting ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      ) : null}

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

      <ConfirmDialog
        isOpen={Boolean(folderToDelete)}
        title="Delete folder"
        description={`This will remove "${folderToDelete?.name ?? 'folder'}" and all cards inside it.`}
        confirmLabel="Delete"
        isProcessing={Boolean(folderToDeleteId && deletingFolderId === folderToDeleteId)}
        onCancel={() => {
          if (deletingFolderId) return;
          setFolderToDelete(null);
        }}
        onConfirm={confirmDeleteFolder}
      />

      <Toast
        type={actionError ? 'error' : 'success'}
        message={actionError || actionSuccess}
        onClose={clearMessages}
      />
    </section>
  );
}

export default CardsPage;
