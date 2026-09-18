import type { Difficulty } from '../core/types';

export type Lang = 'en' | 'pl';
export const LANGS: { id: Lang; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'pl', name: 'Polski' },
];

type Params = Record<string, string | number>;

const en = {
  'meta.description': 'Nurikabe logic puzzles in four difficulties, generated on your device and playable offline.',
  size: 'Size',
  width: 'width',
  height: 'height',
  custom: 'Custom…',
  difficulty: 'Difficulty',
  'diff.easy': 'Easy',
  'diff.medium': 'Medium',
  'diff.hard': 'Hard',
  'diff.expert': 'Expert',
  newGame: 'New game',
  time: 'Time',
  islands: 'Islands',
  walls: 'Walls',
  undo: 'Undo',
  'undo.title': 'Undo (Ctrl+Z)',
  redo: 'Redo',
  'redo.title': 'Redo (Ctrl+Y)',
  pause: 'Pause',
  'pause.title': 'Pause (P)',
  resume: 'Resume',
  hint: 'Hint',
  check: 'Check',
  restart: 'Restart',
  reveal: 'Reveal',
  board: 'Nurikabe board',
  paused: 'Paused — click to resume',
  generating: 'Generating…',
  generatingSize: 'Generating {w} × {h} {difficulty}…',
  solved: 'Solved!',
  close: 'Close',
  copyLink: 'Copy link',
  colorWalls: 'Color separate wall groups',
  language: 'Language',
  howToPlay: 'How to play',
  'help.rules':
    'Shade cells as walls so that every number sits in an island of exactly that many cells, islands never touch each other orthogonally, all walls form one connected group, and no 2×2 block is entirely wall.',
  'help.controls':
    '<b>Click</b> toggles a wall, <b>right-click</b> clears a cell, and dragging paints. Keyboard: arrows move, <kbd>Space</kbd> toggles a wall, <kbd>Backspace</kbd> clears, <kbd>P</kbd> pauses, <kbd>N</kbd> starts a new game.',
  'help.colors':
    'An island that is walled off with exactly its number of cells turns green. When walls are split into several groups each extra group gets its own color; a group that can no longer connect is striped red, as are 2×2 wall pools and walled-off areas that are too small or have no number.',
  linkCopied: 'Puzzle link copied',
  generationFailed: 'Generation failed',
  graded: ' (graded {grade})',
  mistakes: (n: number) => `${n} mistake${n > 1 ? 's' : ''}`,
  noMistakes: 'No mistakes so far',
  cellWrong: 'This cell is wrong',
  nothingToHint: 'Nothing left to hint',
  confirmReveal: 'Reveal the solution? This ends the game.',
  wallsConnected: 'connected',
  wallGroups: (n: number) => `${n} groups`,
  cutOff: ' · {n} cut off',
  pool: '2×2 wall pool',
  brokenIsland: 'broken island',
  newBest: 'New best time!',
  best: 'Best: {time}',
  'cell.clue': 'clue {n}',
  'cell.complete': ', complete',
  'cell.wall': 'wall',
  'cell.empty': 'empty',
  'cell.pos': 'row {row}, column {col}: {label}',
};

type Key = keyof typeof en;
type Dict = { [K in Key]: (typeof en)[K] };

/** Polish plural form: 1 / 2–4 (not 12–14) / everything else. */
function plPlural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const d = n % 10;
  const dd = n % 100;
  return d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? few : many;
}

const pl: Dict = {
  'meta.description': 'Łamigłówki Nurikabe w czterech poziomach trudności, generowane na Twoim urządzeniu i dostępne offline.',
  size: 'Rozmiar',
  width: 'szerokość',
  height: 'wysokość',
  custom: 'Własny…',
  difficulty: 'Poziom',
  'diff.easy': 'Łatwy',
  'diff.medium': 'Średni',
  'diff.hard': 'Trudny',
  'diff.expert': 'Ekspert',
  newGame: 'Nowa gra',
  time: 'Czas',
  islands: 'Wyspy',
  walls: 'Mury',
  undo: 'Cofnij',
  'undo.title': 'Cofnij (Ctrl+Z)',
  redo: 'Ponów',
  'redo.title': 'Ponów (Ctrl+Y)',
  pause: 'Pauza',
  'pause.title': 'Pauza (P)',
  resume: 'Wznów',
  hint: 'Podpowiedź',
  check: 'Sprawdź',
  restart: 'Od nowa',
  reveal: 'Rozwiązanie',
  board: 'Plansza Nurikabe',
  paused: 'Pauza — kliknij, aby wznowić',
  generating: 'Generowanie…',
  generatingSize: 'Generowanie {w} × {h}, poziom {difficulty}…',
  solved: 'Rozwiązane!',
  close: 'Zamknij',
  copyLink: 'Kopiuj link',
  colorWalls: 'Koloruj osobne grupy murów',
  language: 'Język',
  howToPlay: 'Jak grać',
  'help.rules':
    'Zamaluj pola jako mury tak, aby każda liczba leżała na wyspie o dokładnie tylu polach, wyspy nie stykały się ze sobą bokami, wszystkie mury tworzyły jedną spójną grupę i żaden blok 2×2 nie był w całości murem.',
  'help.controls':
    '<b>Kliknięcie</b> przełącza mur, <b>prawy przycisk</b> czyści pole, a przeciąganie maluje. Klawiatura: strzałki przesuwają kursor, <kbd>Spacja</kbd> przełącza mur, <kbd>Backspace</kbd> czyści, <kbd>P</kbd> pauzuje, <kbd>N</kbd> zaczyna nową grę.',
  'help.colors':
    'Wyspa otoczona murem, która ma dokładnie tyle pól, ile wskazuje jej liczba, zmienia kolor na zielony. Gdy mury są podzielone na kilka grup, każda dodatkowa grupa ma własny kolor; grupa, która nie może się już połączyć, jest prążkowana na czerwono — podobnie jak baseny murów 2×2 oraz odcięte obszary, które są za małe lub nie mają liczby.',
  linkCopied: 'Skopiowano link do łamigłówki',
  generationFailed: 'Nie udało się wygenerować łamigłówki',
  graded: ' (oceniony: {grade})',
  mistakes: (n: number) => `${n} ${plPlural(n, 'błąd', 'błędy', 'błędów')}`,
  noMistakes: 'Na razie bez błędów',
  cellWrong: 'To pole jest błędne',
  nothingToHint: 'Brak podpowiedzi',
  confirmReveal: 'Pokazać rozwiązanie? To zakończy grę.',
  wallsConnected: 'połączone',
  wallGroups: (n: number) => `${n} ${plPlural(n, 'grupa', 'grupy', 'grup')}`,
  cutOff: ' · odcięte: {n}',
  pool: 'basen murów 2×2',
  brokenIsland: 'błędna wyspa',
  newBest: 'Nowy rekord!',
  best: 'Rekord: {time}',
  'cell.clue': 'liczba {n}',
  'cell.complete': ', ukończona',
  'cell.wall': 'mur',
  'cell.empty': 'puste',
  'cell.pos': 'wiersz {row}, kolumna {col}: {label}',
};

const DICTS: Record<Lang, Dict> = { en, pl };

export function detectLang(): Lang {
  for (const l of navigator.languages ?? [navigator.language]) {
    const id = l.slice(0, 2).toLowerCase();
    if (id in DICTS) return id as Lang;
  }
  return 'en';
}

let lang: Lang = 'en';

export function getLang(): Lang {
  return lang;
}

type StringKey = { [K in Key]: Dict[K] extends string ? K : never }[Key];
type CountKey = Exclude<Key, StringKey>;

export function t(key: StringKey, params?: Params): string {
  const s = DICTS[lang][key] as string;
  return params ? s.replace(/\{(\w+)\}/g, (m, p) => (p in params ? String(params[p]) : m)) : s;
}

/** A string whose wording depends on a count (plural forms). */
export function tn(key: CountKey, n: number): string {
  return (DICTS[lang][key] as (n: number) => string)(n);
}

export function difficultyName(d: Difficulty): string {
  return t(`diff.${d}`);
}

/**
 * Switch the language and translate the static page: elements carry `data-i18n` (text),
 * `data-i18n-html`, `data-i18n-title` or `data-i18n-aria` naming a key.
 */
export function setLang(l: Lang): void {
  lang = l in DICTS ? l : 'en';
  document.documentElement.lang = lang;
  const each = (attr: string, fn: (el: HTMLElement, k: StringKey) => void) =>
    document.querySelectorAll<HTMLElement>(`[${attr}]`).forEach((el) => fn(el, el.getAttribute(attr) as StringKey));
  each('data-i18n', (el, k) => (el.textContent = t(k)));
  each('data-i18n-html', (el, k) => (el.innerHTML = t(k)));
  each('data-i18n-title', (el, k) => (el.title = t(k)));
  each('data-i18n-aria', (el, k) => el.setAttribute('aria-label', t(k)));
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('meta.description'));
}
