import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  fetchFlashcardFolders,
  createFlashcardFolder,
  deleteFlashcardFolder,
} from '@/entities/flashcard/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { extractErrorMessage } from '@/features/auth/lib/extractErrorMessage';
import { normalizeId } from '@/shared/lib/normalizeId';
import ConfirmDialog from '@/shared/ui/ConfirmDialog';
import EmptyState from '@/shared/ui/EmptyState';
import LoadingSpinner from '@/shared/ui/LoadingSpinner';
import Toast from '@/shared/ui/Toast';
import CreateFolderModal from '@/pages/dashboard/CreateFolderModal';
import { countCards } from '@/pages/dashboard/lib/dashboardHelpers';
import styles from './allFoldersPage.module.css';

const FOLDER_NAME_MAX_LENGTH = 60;

function AllFoldersPage() {
  const { token, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [folders, setFolders] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [folderToDelete, setFolderToDelete] = useState(null);
  const [deletingFolderId, setDeletingFolderId] = useState(null);

  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('success');

  const showToast = (message, type = 'success') => {
    setToastMessage(message);
    setToastType(type);
  };

  useEffect(() => {
    if (!toastMessage) return undefined;
    const timer = setTimeout(() => setToastMessage(''), 3200);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const loadFolders = useCallback(async () => {
    if (!isAuthenticated) return;
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
  }, [token, isAuthenticated]);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  const handleCreate = async (rawName) => {
    const name = (rawName ?? '').trim();
    if (!name) {
      setCreateError('Folder name is required');
      return false;
    }
    if (name.length > FOLDER_NAME_MAX_LENGTH) {
      setCreateError(`Folder name must be ${FOLDER_NAME_MAX_LENGTH} characters or less`);
      return false;
    }
    const isDuplicate = folders.some(
      (f) => (f.name ?? '').trim().toLowerCase() === name.toLowerCase(),
    );
    if (isDuplicate) {
      setCreateError('A folder with this name already exists');
      return false;
    }

    setIsCreating(true);
    setCreateError('');
    try {
      const created = await createFlashcardFolder({ token, name });
      setFolders((prev) => [created, ...prev]);
      showToast('Folder created');
      setIsCreateOpen(false);
      return true;
    } catch (error) {
      setCreateError(extractErrorMessage(error, { context: 'cards' }));
      return false;
    } finally {
      setIsCreating(false);
    }
  };

  const confirmDelete = async () => {
    const folderId = normalizeId(folderToDelete?.id);
    if (!folderId) {
      setFolderToDelete(null);
      return;
    }
    setDeletingFolderId(folderId);
    try {
      await deleteFlashcardFolder({ token, folderId });
      setFolders((prev) => prev.filter((f) => normalizeId(f.id) !== folderId));
      showToast('Folder deleted');
      setFolderToDelete(null);
    } catch (error) {
      showToast(extractErrorMessage(error, { context: 'cards' }), 'error');
    } finally {
      setDeletingFolderId(null);
    }
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link to="/" className={styles.backButton}>
            Back to dashboard
          </Link>
          <h2 className={styles.title}>My Flashcards</h2>
          {!isLoading && folders.length > 0 && (
            <p className={styles.metaText}>{folders.length} folders</p>
          )}
        </div>

        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => {
            setCreateError('');
            setIsCreateOpen(true);
          }}>
          + Create Folder
        </button>
      </header>

      {loadError && <p className={styles.errorText}>{loadError}</p>}

      {isLoading && (
        <div className={styles.loadingRow}>
          <LoadingSpinner size="sm" />
          <span>Loading folders...</span>
        </div>
      )}

      {!isLoading && folders.length === 0 && !loadError && (
        <EmptyState
          kind="folder"
          title="No folders created"
          description="Create your first folder to organize flashcards."
          actionLabel="Create folder"
          onAction={() => {
            setCreateError('');
            setIsCreateOpen(true);
          }}
        />
      )}

      {!isLoading && folders.length > 0 && (
        <div className={styles.foldersGrid}>
          {folders.map((folder, index) => {
            const id = normalizeId(folder.id);
            return (
              <article key={id ?? `fl-${index}`} className={styles.folderCard}>
                <button
                  type="button"
                  className={styles.folderMainButton}
                  onClick={() => id && navigate(`/cards/${id}`)}
                  disabled={!id}>
                  <span className={styles.folderIcon}>&#128193;</span>
                  <p className={styles.folderName}>{folder.name}</p>
                  <p className={styles.folderMeta}>{countCards(folder)} cards</p>
                </button>
                <button
                  type="button"
                  className={styles.deleteButton}
                  onClick={() => setFolderToDelete(folder)}
                  title="Delete folder">
                  &times;
                </button>
              </article>
            );
          })}
        </div>
      )}

      {isCreateOpen && (
        <CreateFolderModal
          isSubmitting={isCreating}
          errorMessage={createError}
          maxLength={FOLDER_NAME_MAX_LENGTH}
          onClose={() => {
            if (!isCreating) {
              setIsCreateOpen(false);
              setCreateError('');
            }
          }}
          onCreate={handleCreate}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(folderToDelete)}
        title="Delete folder"
        description={`This will remove "${
          folderToDelete?.name ?? 'folder'
        }" and all cards inside it.`}
        confirmLabel="Delete"
        isProcessing={Boolean(deletingFolderId)}
        onCancel={() => {
          if (!deletingFolderId) setFolderToDelete(null);
        }}
        onConfirm={confirmDelete}
      />

      <Toast type={toastType} message={toastMessage} onClose={() => setToastMessage('')} />
    </section>
  );
}

export default AllFoldersPage;
