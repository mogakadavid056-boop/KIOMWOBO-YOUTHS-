export interface BibleBookMeta {
  name: string;
  swahiliName: string;
  chapters: number;
  testament: 'OT' | 'NT';
}

export const BIBLE_BOOKS: BibleBookMeta[] = [
  { name: 'Genesis', swahiliName: 'Mwanzo', chapters: 50, testament: 'OT' },
  { name: 'Exodus', swahiliName: 'Kutoka', chapters: 40, testament: 'OT' },
  { name: 'Leviticus', swahiliName: 'Mambo ya Walawi', chapters: 27, testament: 'OT' },
  { name: 'Numbers', swahiliName: 'Hesabu', chapters: 36, testament: 'OT' },
  { name: 'Deuteronomy', swahiliName: 'Kumbukumbu la Torati', chapters: 34, testament: 'OT' },
  { name: 'Joshua', swahiliName: 'Yoshua', chapters: 24, testament: 'OT' },
  { name: 'Judges', swahiliName: 'Waamuzi', chapters: 21, testament: 'OT' },
  { name: 'Ruth', swahiliName: 'Ruthu', chapters: 4, testament: 'OT' },
  { name: '1 Samuel', swahiliName: '1 Samweli', chapters: 31, testament: 'OT' },
  { name: '2 Samuel', swahiliName: '2 Samweli', chapters: 24, testament: 'OT' },
  { name: '1 Kings', swahiliName: '1 Wafalme', chapters: 22, testament: 'OT' },
  { name: '2 Kings', swahiliName: '2 Wafalme', chapters: 25, testament: 'OT' },
  { name: '1 Chronicles', swahiliName: '1 Mambo ya Nyakati', chapters: 29, testament: 'OT' },
  { name: '2 Chronicles', swahiliName: '2 Mambo ya Nyakati', chapters: 36, testament: 'OT' },
  { name: 'Ezra', swahiliName: 'Ezra', chapters: 10, testament: 'OT' },
  { name: 'Nehemiah', swahiliName: 'Nehemia', chapters: 13, testament: 'OT' },
  { name: 'Esther', swahiliName: 'Esta', chapters: 10, testament: 'OT' },
  { name: 'Job', swahiliName: 'Ayubu', chapters: 42, testament: 'OT' },
  { name: 'Psalms', swahiliName: 'Zaburi', chapters: 150, testament: 'OT' },
  { name: 'Proverbs', swahiliName: 'Mithali', chapters: 31, testament: 'OT' },
  { name: 'Ecclesiastes', swahiliName: 'Mhubiri', chapters: 12, testament: 'OT' },
  { name: 'Song of Solomon', swahiliName: 'Wimbo Ulio Bora', chapters: 8, testament: 'OT' },
  { name: 'Isaiah', swahiliName: 'Isaya', chapters: 66, testament: 'OT' },
  { name: 'Jeremiah', swahiliName: 'Yeremia', chapters: 52, testament: 'OT' },
  { name: 'Lamentations', swahiliName: 'Maombolezo', chapters: 5, testament: 'OT' },
  { name: 'Ezekiel', swahiliName: 'Ezekieli', chapters: 48, testament: 'OT' },
  { name: 'Daniel', swahiliName: 'Danieli', chapters: 12, testament: 'OT' },
  { name: 'Hosea', swahiliName: 'Hosea', chapters: 14, testament: 'OT' },
  { name: 'Joel', swahiliName: 'Yoeli', chapters: 3, testament: 'OT' },
  { name: 'Amos', swahiliName: 'Amosi', chapters: 9, testament: 'OT' },
  { name: 'Obadiah', swahiliName: 'Obadia', chapters: 1, testament: 'OT' },
  { name: 'Jonah', swahiliName: 'Yona', chapters: 4, testament: 'OT' },
  { name: 'Micah', swahiliName: 'Mika', chapters: 7, testament: 'OT' },
  { name: 'Nahum', swahiliName: 'Nahumu', chapters: 3, testament: 'OT' },
  { name: 'Habakkuk', swahiliName: 'Habakuki', chapters: 3, testament: 'OT' },
  { name: 'Zephaniah', swahiliName: 'Sefania', chapters: 3, testament: 'OT' },
  { name: 'Haggai', swahiliName: 'Hagai', chapters: 2, testament: 'OT' },
  { name: 'Zechariah', swahiliName: 'Zekaria', chapters: 14, testament: 'OT' },
  { name: 'Malachi', swahiliName: 'Malaki', chapters: 4, testament: 'OT' },
  { name: 'Matthew', swahiliName: 'Mathayo', chapters: 28, testament: 'NT' },
  { name: 'Mark', swahiliName: 'Marko', chapters: 16, testament: 'NT' },
  { name: 'Luke', swahiliName: 'Luka', chapters: 24, testament: 'NT' },
  { name: 'John', swahiliName: 'Yohana', chapters: 21, testament: 'NT' },
  { name: 'Acts', swahiliName: 'Matendo ya Mitume', chapters: 28, testament: 'NT' },
  { name: 'Romans', swahiliName: 'Warumi', chapters: 16, testament: 'NT' },
  { name: '1 Corinthians', swahiliName: '1 Wakorintho', chapters: 16, testament: 'NT' },
  { name: '2 Corinthians', swahiliName: '2 Wakorintho', chapters: 13, testament: 'NT' },
  { name: 'Galatians', swahiliName: 'Wagalatia', chapters: 6, testament: 'NT' },
  { name: 'Ephesians', swahiliName: 'Waefeso', chapters: 6, testament: 'NT' },
  { name: 'Philippians', swahiliName: 'Wafilipi', chapters: 4, testament: 'NT' },
  { name: 'Colossians', swahiliName: 'Wakolosai', chapters: 4, testament: 'NT' },
  { name: '1 Thessalonians', swahiliName: '1 Wathesalonike', chapters: 5, testament: 'NT' },
  { name: '2 Thessalonians', swahiliName: '2 Wathesalonike', chapters: 3, testament: 'NT' },
  { name: '1 Timothy', swahiliName: '1 Timotheo', chapters: 6, testament: 'NT' },
  { name: '2 Timothy', swahiliName: '2 Timotheo', chapters: 4, testament: 'NT' },
  { name: 'Titus', swahiliName: 'Tito', chapters: 3, testament: 'NT' },
  { name: 'Philemon', swahiliName: 'Filemoni', chapters: 1, testament: 'NT' },
  { name: 'Hebrews', swahiliName: 'Waebrania', chapters: 13, testament: 'NT' },
  { name: 'James', swahiliName: 'Yakobo', chapters: 5, testament: 'NT' },
  { name: '1 Peter', swahiliName: '1 Petro', chapters: 5, testament: 'NT' },
  { name: '2 Peter', swahiliName: '2 Petro', chapters: 3, testament: 'NT' },
  { name: '1 John', swahiliName: '1 Yohana', chapters: 5, testament: 'NT' },
  { name: '2 John', swahiliName: '2 Yohana', chapters: 1, testament: 'NT' },
  { name: '3 John', swahiliName: '3 Yohana', chapters: 1, testament: 'NT' },
  { name: 'Jude', swahiliName: 'Yuda', chapters: 1, testament: 'NT' },
  { name: 'Revelation', swahiliName: 'Ufunuo wa Yohana', chapters: 22, testament: 'NT' },
];

export const DAILY_VERSES_FALLBACK = [
  {
    reference: '1 Timothy 4:12',
    kjv: 'Let no man despise thy youth; but be thou an example of the believers, in word, in conversation, in charity, in spirit, in faith, in purity.',
    swahili: 'Mtu awaye yote asiudharau ujana wako, bali uwe kielelezo kwao waaminio, katika usemi na mwenendo, na katika upendo na imani na usafi.',
  },
  {
    reference: 'Jeremiah 29:11',
    kjv: 'For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.',
    swahili: 'Maana nayajua mawazo ninayowawazia ninyi, asema BWANA, ni mawazo ya amani wala si ya mabaya, kuwapa ninyi tumaini siku zenu za mwisho.',
  },
  {
    reference: 'Ecclesiastes 12:1',
    kjv: 'Remember now thy Creator in the days of thy youth, while the evil days come not, nor the years draw nigh, when thou shalt say, I have no pleasure in them;',
    swahili: 'Mkumbuke Muumba wako siku za ujana wako, kabla hazijaja siku zilizo mbaya, wala haijakaribia miaka utakaposema, Mimi sina furaha katika hiyo.',
  },
  {
    reference: 'Isaiah 40:31',
    kjv: 'But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.',
    swahili: 'Bali wao wamngojeao BWANA watapata nguvu mpya; watapanda juu kwa mbawa kama tai; watakimbia, wala hawatachoka; watakwenda kwa miguu, wala hawatazimia.',
  },
  {
    reference: 'Psalms 119:9',
    kjv: 'Wherewithal shall a young man cleanse his way? by taking heed thereto according to thy word.',
    swahili: 'Jinsi gani kijana aisafishe njia yake? Kwa kutii, akilifuata neno lako.',
  },
  {
    reference: 'Proverbs 3:5-6',
    kjv: 'Trust in the LORD with all thine heart; and lean not unto thine own understanding. In all thy ways acknowledge him, and he shall direct thy paths.',
    swahili: 'Mtumaini BWANA kwa moyo wako wote, wala usizitegemee akili zako mwenyewe; katika njia zako zote mkiri yeye, naye atayanyosha mapito yako.',
  },
  {
    reference: 'Revelation 14:12',
    kjv: 'Here is the patience of the saints: here are they that keep the commandments of God, and the faith of Jesus.',
    swahili: 'Hapa ndipo penye subira ya watakatifu, hao wazishikao amri za Mungu, na imani ya Yesu.',
  },
];

export function getDayOfYearIndex(mod: number): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const day = Math.floor(diff / (1000 * 60 * 60 * 24));
  return day % mod;
}
