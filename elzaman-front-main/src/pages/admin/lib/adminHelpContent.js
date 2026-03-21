export const HELP_ARTISTS = {
  title: 'Artists',
  description:
    'Create or update artist profiles. Each song is linked to an artist. When you create a song, the artist is auto-created if it does not exist yet.',
  format: 'Fill in the artist name. Bio and avatar URL are optional.',
  steps: [
    'To create: fill in the name and click "Create artist".',
    'To update: select the artist from the dropdown, edit the fields, click "Update artist".',
  ],
  examples: ['Artist name: Mirlan Turgunov', 'Bio: Kyrgyz musician and composer'],
};

export const HELP_SONGS = {
  title: 'Songs',
  description:
    'Create or update songs in the catalog. Songs are the core content that learners study. Each song can have lyrics in Kyrgyz and Russian.',
  format:
    'Fill in the song title and artist name. Other fields (year, duration, YouTube URL, lyrics) are optional but recommended.',
  steps: [
    'To create a new song: fill in the title and artist, then click "Create song".',
    'To edit an existing song: select it from the dropdown, click "Load", edit the fields, then click "Update song".',
    'Lyrics can be added here or later via the "Lyrics" tab.',
  ],
  examples: [
    'Title: Kyrgyzstan',
    'Artist: Mirlan Turgunov',
    'Language: kg',
  ],
};

export const HELP_FLASHCARDS = {
  title: 'Flashcards (Exercise 1)',
  description:
    'Flashcards are word cards shown to the learner. Each card has a Kyrgyz word on the front and a Russian translation on the back. Cards are grouped by level (1 through 5). Level 1 is the easiest, level 5 is the hardest.',
  format:
    'Enter one card per line. Use a hyphen surrounded by spaces ( - ) to separate the Kyrgyz word from the Russian translation.',
  steps: [
    'Select a song from the dropdown.',
    'Choose the difficulty level (1 = easiest, 5 = hardest).',
    'Enter the flashcard pairs, one per line.',
    'Click "Save flashcards".',
  ],
  examples: [
    'salaam - privet',
    'rakhmat - spasibo',
    'zhakshy - khorosho',
  ],
};

export const HELP_PAIRS = {
  title: 'Pairs Matching Game (Exercises 2-5)',
  description:
    'The pairs game shows Kyrgyz words on one side and Russian translations on the other. The learner must match them correctly. Each exercise number (2, 3, 4, 5) is a separate matching game for the same song.',
  format:
    'Enter one pair per line. Use a hyphen surrounded by spaces ( - ) to separate the Kyrgyz word from the Russian translation.',
  steps: [
    'Select a song from the dropdown.',
    'Choose the exercise number (2, 3, 4, or 5).',
    'Enter the word pairs, one per line.',
    'Click "Save pairs".',
  ],
  examples: [
    'salaam - privet',
    'rakhmat - spasibo',
    'zhakshy - khorosho',
  ],
};

export const HELP_LYRICS = {
  title: 'Lyrics & Dictionary',
  description:
    'Manage song lyrics and word-by-word dictionary translations. The lyrics must first be tokenized (split into words) before dictionary entries can be added.',
  format:
    'For the dictionary, enter one word per line. Use a hyphen surrounded by spaces ( - ) to separate the Kyrgyz word from the Russian translation.',
  steps: [
    'Make sure the song has Kyrgyz lyrics saved (add them in the "Songs" tab if not).',
    'Click "Tokenize lyrics" to split lyrics into individual words.',
    'Enter dictionary entries (word translations) in the text area below.',
    'Click "Save dictionary" to upload the translations.',
  ],
  examples: [
    'zhanymda - ryadom so mnoy',
    'kelechek - budushcheye',
    'zhyryogym - moyo serdtse',
  ],
};
