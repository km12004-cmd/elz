import { useState } from 'react';
import styles from './searchsong.module.css';

export const SearchInput = () => {
  const [inputValue, setInputValue] = useState('');

  return (
    <div className={styles.inputWrapper}>
      <input
        className={styles.input}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder="Find your favourite song :)"
      />
    </div>
  );
};
