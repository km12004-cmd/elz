import styles from '../../pages/admin/adminConsolePage.module.css';

function SongPicker({ songs, value, onChange, disabled, label = 'Song', id = 'song-picker' }) {
  return (
    <div className={styles.formRow}>
      <label className={styles.fieldLabel} htmlFor={id}>{label}</label>
      <select
        id={id}
        className={styles.select}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">Select a song...</option>
        {songs.map((song) => (
          <option key={song.id} value={song.id}>
            {song.title} (ID: {song.id})
          </option>
        ))}
      </select>
    </div>
  );
}

export default SongPicker;
