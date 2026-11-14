import type {
  Achievement, AdUnit, Article, AuditEntry, AvatarDef, Challenge, CrmMessage,
  GameConfig, LeaderboardEntry, MediaAsset, PermissionDef, Report,
  RewardEntry, Room, SeoRecord, RedirectRule, SystemSettings, Title, User, Word, XpConfig,
} from '@/types';
import { AVATAR_IMAGES, ACHIEVEMENT_IMAGES, TITLE_IMAGES } from './assets';

export const AVATARS: AvatarDef[] = [
  { id: 'av-01', name: 'Orbit', shape: 0, enabled: true, isDefault: true, order: 0 },
  { id: 'av-02', name: 'Prism', shape: 1, enabled: true, isDefault: false, order: 1 },
  { id: 'av-03', name: 'Nova', shape: 2, enabled: true, isDefault: false, order: 2 },
  { id: 'av-04', name: 'Pixel', shape: 3, enabled: true, isDefault: false, order: 3 },
  { id: 'av-05', name: 'Comet', shape: 4, enabled: true, isDefault: false, order: 4 },
  { id: 'av-06', name: 'Quartz', shape: 5, enabled: true, isDefault: false, order: 5 },
  { id: 'av-07', name: 'Echo', shape: 6, enabled: true, isDefault: false, order: 6 },
  { id: 'av-08', name: 'Flux', shape: 7, enabled: true, isDefault: false, order: 7 },
  { id: 'av-09', name: 'Halo', shape: 8, enabled: true, isDefault: false, order: 8 },
  { id: 'av-10', name: 'Onyx', shape: 9, enabled: true, isDefault: false, order: 9 },
  { id: 'av-11', name: 'Zephyr', shape: 10, enabled: false, isDefault: false, order: 10 },
  { id: 'av-12', name: 'Lyra', shape: 11, enabled: false, isDefault: false, order: 11 },
].map((a) => ({ ...a, image: AVATAR_IMAGES[a.id] }));

const stats = (matches: number, wins: number, correctGuesses: number, wordsDrawn: number, totalScore: number, bestScore: number) =>
  ({ matches, wins, correctGuesses, wordsDrawn, totalScore, bestScore });

export const USERS: User[] = [
  { id: 'u-admin', username: 'admin', email: 'admin@drawspace.cloud', avatarId: 'av-10', bio: 'Keeps DrawSpace running.', role: 'superadmin', status: 'active', level: 42, xp: 84200, titleId: 't-founder', createdAt: '2025-11-02T10:00:00Z', lastSeenAt: '2026-11-11T08:00:00Z', stats: stats(312, 148, 1204, 980, 184500, 1480), locale: 'en-US' },
  { id: 'u-maya', username: 'maya', email: 'maya@example.com', avatarId: 'av-03', bio: 'Fast guesser, slow drawer.', role: 'admin', status: 'active', level: 28, xp: 51200, titleId: 't-wordsmith', createdAt: '2026-01-14T10:00:00Z', lastSeenAt: '2026-11-10T21:00:00Z', stats: stats(240, 96, 980, 720, 132000, 1290), locale: 'en-GB' },
  { id: 'u-leo', username: 'leo', email: 'leo@example.com', avatarId: 'av-05', bio: '', role: 'moderator', status: 'active', level: 22, xp: 38400, titleId: 't-guardian', createdAt: '2026-02-03T10:00:00Z', lastSeenAt: '2026-11-11T07:30:00Z', stats: stats(198, 71, 812, 590, 104300, 1150), locale: 'fr' },
  { id: 'u-sana', username: 'sana', email: 'sana@example.com', avatarId: 'av-07', bio: 'Support and community.', role: 'support', status: 'active', level: 17, xp: 26100, titleId: null, createdAt: '2026-03-19T10:00:00Z', lastSeenAt: '2026-11-10T18:00:00Z', stats: stats(150, 44, 601, 430, 78200, 980), locale: 'ar' },
  { id: 'u-kai', username: 'kai', email: 'kai@example.com', avatarId: 'av-01', bio: 'Draws cats only.', role: 'player', status: 'active', level: 31, xp: 59800, titleId: 't-artist', createdAt: '2026-01-02T10:00:00Z', lastSeenAt: '2026-11-11T09:12:00Z', stats: stats(276, 120, 1102, 860, 151800, 1380), locale: 'en-US' },
  { id: 'u-ines', username: 'ines', email: 'ines@example.com', avatarId: 'av-02', bio: '', role: 'player', status: 'active', level: 25, xp: 46200, titleId: 't-wordsmith', createdAt: '2026-02-11T10:00:00Z', lastSeenAt: '2026-11-10T22:40:00Z', stats: stats(220, 88, 940, 610, 121400, 1220), locale: 'es' },
  { id: 'u-tomas', username: 'tomas', email: 'tomas@example.com', avatarId: 'av-04', bio: 'Weekend player.', role: 'player', status: 'active', level: 14, xp: 19800, titleId: null, createdAt: '2026-04-05T10:00:00Z', lastSeenAt: '2026-11-09T16:00:00Z', stats: stats(120, 30, 480, 350, 61200, 870), locale: 'pt-BR' },
  { id: 'u-anna', username: 'anna', email: 'anna@example.com', avatarId: 'av-06', bio: '', role: 'player', status: 'active', level: 19, xp: 31500, titleId: 't-streak', createdAt: '2026-03-01T10:00:00Z', lastSeenAt: '2026-11-11T06:50:00Z', stats: stats(170, 62, 720, 500, 89400, 1050), locale: 'de' },
  { id: 'u-ilya', username: 'ilya', email: 'ilya@example.com', avatarId: 'av-08', bio: '', role: 'player', status: 'suspended', level: 9, xp: 11400, titleId: null, createdAt: '2026-05-21T10:00:00Z', lastSeenAt: '2026-11-02T12:00:00Z', stats: stats(80, 14, 300, 210, 38900, 720), locale: 'ru' },
  { id: 'u-noor', username: 'noor', email: 'noor@example.com', avatarId: 'av-09', bio: 'Learning English one word at a time.', role: 'player', status: 'active', level: 12, xp: 16700, titleId: null, createdAt: '2026-06-08T10:00:00Z', lastSeenAt: '2026-11-10T20:15:00Z', stats: stats(96, 22, 410, 280, 47800, 810), locale: 'ar' },
  { id: 'u-pedro', username: 'pedro', email: 'pedro@example.com', avatarId: 'av-11', bio: '', role: 'player', status: 'active', level: 7, xp: 8200, titleId: null, createdAt: '2026-07-16T10:00:00Z', lastSeenAt: '2026-11-08T14:00:00Z', stats: stats(58, 10, 230, 160, 27400, 640), locale: 'pt-BR' },
  { id: 'u-greta', username: 'greta', email: 'greta@example.com', avatarId: 'av-12', bio: '', role: 'player', status: 'banned', level: 5, xp: 5100, titleId: null, createdAt: '2026-08-02T10:00:00Z', lastSeenAt: '2026-10-20T09:00:00Z', stats: stats(40, 6, 150, 110, 18200, 540), locale: 'de' },
];

export const TOTAL_REGISTERED = 1284;

const w = (id: string, text: string, difficulty: Word['difficulty'], category: string, hint: string, definition: string): Word =>
  ({ id, text, difficulty, category, hint, definition, active: true, translations: {} });

export const WORDS: Word[] = [
  w('w01', 'cat', 'easy', 'Animals', 'A small pet that says meow.', 'A small domesticated feline.'),
  w('w02', 'house', 'easy', 'Places', 'A building where people live.', 'A building for human habitation.'),
  w('w03', 'sun', 'easy', 'Nature', 'It rises in the morning.', 'The star at the center of our solar system.'),
  w('w04', 'tree', 'easy', 'Nature', 'It has a trunk and leaves.', 'A tall plant with a wooden trunk.'),
  w('w05', 'fish', 'easy', 'Animals', 'It lives in water.', 'An aquatic animal with gills and fins.'),
  w('w06', 'car', 'easy', 'Objects', 'It has four wheels.', 'A road vehicle with an engine.'),
  w('w07', 'book', 'easy', 'Objects', 'You read it.', 'A set of written or printed pages bound together.'),
  w('w08', 'apple', 'easy', 'Food', 'A round fruit, often red or green.', 'The fruit of the apple tree.'),
  w('w09', 'chair', 'easy', 'Objects', 'You sit on it.', 'A seat for one person with a back.'),
  w('w10', 'moon', 'easy', 'Nature', 'It glows at night.', 'The natural satellite of Earth.'),
  w('w11', 'dog', 'easy', 'Animals', 'A pet that barks.', 'A domesticated canine.'),
  w('w12', 'star', 'easy', 'Nature', 'It twinkles in the night sky.', 'A luminous point in the night sky.'),
  w('w13', 'guitar', 'medium', 'Music', 'A string instrument you strum.', 'A musical instrument with six strings.'),
  w('w14', 'bridge', 'medium', 'Places', 'It crosses a river.', 'A structure carrying a path over an obstacle.'),
  w('w15', 'rocket', 'medium', 'Objects', 'It flies to space.', 'A vehicle propelled by combustion, used in spaceflight.'),
  w('w16', 'camera', 'medium', 'Objects', 'It takes photos.', 'A device for capturing images.'),
  w('w17', 'island', 'medium', 'Nature', 'Land surrounded by water.', 'A piece of land surrounded by water.'),
  w('w18', 'castle', 'medium', 'Places', 'Kings and queens live here.', 'A large fortified building.'),
  w('w19', 'penguin', 'medium', 'Animals', 'A bird that cannot fly, dressed in black and white.', 'A flightless seabird of the southern hemisphere.'),
  w('w20', 'pizza', 'medium', 'Food', 'Round, baked, with cheese.', 'A baked flatbread with toppings.'),
  w('w21', 'ladder', 'medium', 'Objects', 'You climb it.', 'A structure of rungs for climbing.'),
  w('w22', 'anchor', 'medium', 'Objects', 'It keeps a ship in place.', 'A heavy device dropped to hold a vessel.'),
  w('w23', 'volcano', 'medium', 'Nature', 'A mountain that erupts.', 'A mountain with an opening for lava.'),
  w('w24', 'lantern', 'medium', 'Objects', 'A portable light.', 'A lamp with a protective case.'),
  w('w25', 'telescope', 'hard', 'Objects', 'You look at stars through it.', 'An optical instrument for distant objects.'),
  w('w26', 'labyrinth', 'hard', 'Places', 'A maze.', 'A complicated network of paths.'),
  w('w27', 'chameleon', 'hard', 'Animals', 'It changes color.', 'A lizard able to change skin color.'),
  w('w28', 'hourglass', 'hard', 'Objects', 'Sand measures time inside it.', 'A timepiece with two glass bulbs.'),
  w('w29', 'waterfall', 'hard', 'Nature', 'A river falling off a cliff.', 'A cascade of water over a vertical drop.'),
  w('w30', 'marionette', 'hard', 'Objects', 'A puppet on strings.', 'A puppet controlled from above by strings.'),
  w('w31', 'constellation', 'hard', 'Nature', 'A pattern of stars.', 'A named group of stars.'),
  w('w32', 'periscope', 'hard', 'Objects', 'A submarine sees through it.', 'A tube with mirrors for seeing over obstacles.'),
  w('w33', 'archipelago', 'hard', 'Places', 'A chain of islands.', 'A group of islands.'),
  w('w34', 'silhouette', 'hard', 'Art', 'A dark outline against light.', 'The dark shape of something against a brighter background.'),
  w('w35', 'origami', 'hard', 'Art', 'Paper folding.', 'The art of folding paper.'),
  w('w36', 'kaleidoscope', 'hard', 'Objects', 'A tube of shifting patterns.', 'A tube with mirrors and colored glass.'),
];

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'a-first', name: 'First Words', description: 'Guess your first word correctly.', icon: 'sparkles', xpReward: 20, condition: '1 correct guess', active: true, unlockedAt: '2026-10-28T15:00:00Z', progress: 1, goal: 1 },
  { id: 'a-guess10', name: 'Sharp Eye', description: 'Guess 10 words correctly.', icon: 'eye', xpReward: 50, condition: '10 correct guesses', active: true, unlockedAt: '2026-11-02T18:00:00Z', progress: 10, goal: 10 },
  { id: 'a-guess100', name: 'Word Hunter', description: 'Guess 100 words correctly.', icon: 'target', xpReward: 200, condition: '100 correct guesses', active: true, progress: 64, goal: 100 },
  { id: 'a-draw1', name: 'First Stroke', description: 'Complete your first drawing turn.', icon: 'pen', xpReward: 20, condition: '1 drawing turn', active: true, unlockedAt: '2026-10-28T15:20:00Z', progress: 1, goal: 1 },
  { id: 'a-draw50', name: 'Resident Artist', description: 'Complete 50 drawing turns.', icon: 'palette', xpReward: 200, condition: '50 drawing turns', active: true, progress: 22, goal: 50 },
  { id: 'a-win1', name: 'First Win', description: 'Win your first match.', icon: 'trophy', xpReward: 50, condition: '1 match win', active: true, unlockedAt: '2026-11-01T19:00:00Z', progress: 1, goal: 1 },
  { id: 'a-win25', name: 'Podium Regular', description: 'Win 25 matches.', icon: 'medal', xpReward: 250, condition: '25 match wins', active: true, progress: 9, goal: 25 },
  { id: 'a-fast', name: 'Quick Thinker', description: 'Be the first to guess 20 words.', icon: 'zap', xpReward: 150, condition: '20 first guesses', active: true, progress: 7, goal: 20 },
  { id: 'a-streak7', name: 'Full Week', description: 'Play on 7 days in a row.', icon: 'calendar', xpReward: 120, condition: '7 day streak', active: true, progress: 4, goal: 7 },
  { id: 'a-social', name: 'Full House', description: 'Play a match with 8 players.', icon: 'users', xpReward: 80, condition: '1 match with 8 players', active: true, progress: 0, goal: 1 },
  { id: 'a-hard', name: 'Deep Vocabulary', description: 'Guess 25 hard words.', icon: 'book', xpReward: 180, condition: '25 hard words', active: true, progress: 11, goal: 25 },
  { id: 'a-level10', name: 'Level 10', description: 'Reach level 10.', icon: 'trending', xpReward: 100, condition: 'Reach level 10', active: true, unlockedAt: '2026-11-05T12:00:00Z', progress: 10, goal: 10 },
].map((a) => ({ ...a, image: ACHIEVEMENT_IMAGES[a.id] }));

export const TITLES: Title[] = [
  { id: 't-newcomer', name: 'Newcomer', description: 'Joined DrawSpace.', xpReward: 0, condition: 'Create an account', active: true, unlocked: true },
  { id: 't-guesser', name: 'Guesser', description: '50 correct guesses.', xpReward: 30, condition: '50 correct guesses', active: true, unlocked: true },
  { id: 't-artist', name: 'Artist', description: '100 drawing turns.', xpReward: 60, condition: '100 drawing turns', active: true, unlocked: false },
  { id: 't-wordsmith', name: 'Wordsmith', description: '300 correct guesses.', xpReward: 120, condition: '300 correct guesses', active: true, unlocked: false },
  { id: 't-streak', name: 'Streak Keeper', description: '14 day streak.', xpReward: 90, condition: '14 day streak', active: true, unlocked: false },
  { id: 't-guardian', name: 'Guardian', description: 'Helped moderate the community.', xpReward: 0, condition: 'Moderator role', active: true, unlocked: false },
  { id: 't-champion', name: 'Champion', description: '100 match wins.', xpReward: 200, condition: '100 match wins', active: true, unlocked: false },
  { id: 't-founder', name: 'Founder', description: 'Part of the team since day one.', xpReward: 0, condition: 'Team member', active: true, unlocked: false },
].map((t) => ({ ...t, image: TITLE_IMAGES[t.id] }));

export const CHALLENGES: Challenge[] = [
  { id: 'c-d1', name: 'Warm up', description: 'Guess 5 words correctly today.', period: 'daily', objective: 5, progress: 3, xpReward: 40, startsAt: '2026-11-11T00:00:00Z', endsAt: '2026-11-12T00:00:00Z', claimed: false, active: true },
  { id: 'c-d2', name: 'Take the pen', description: 'Complete 2 drawing turns today.', period: 'daily', objective: 2, progress: 1, xpReward: 40, startsAt: '2026-11-11T00:00:00Z', endsAt: '2026-11-12T00:00:00Z', claimed: false, active: true },
  { id: 'c-d3', name: 'One more round', description: 'Finish 3 matches today.', period: 'daily', objective: 3, progress: 3, xpReward: 60, startsAt: '2026-11-11T00:00:00Z', endsAt: '2026-11-12T00:00:00Z', claimed: false, active: true },
  { id: 'c-w1', name: 'Weekly vocabulary', description: 'Guess 40 words this week.', period: 'weekly', objective: 40, progress: 18, xpReward: 200, startsAt: '2026-11-09T00:00:00Z', endsAt: '2026-11-16T00:00:00Z', claimed: false, active: true },
  { id: 'c-w2', name: 'Gallery week', description: 'Complete 12 drawing turns this week.', period: 'weekly', objective: 12, progress: 5, xpReward: 220, startsAt: '2026-11-09T00:00:00Z', endsAt: '2026-11-16T00:00:00Z', claimed: false, active: true },
  { id: 'c-w3', name: 'Podium push', description: 'Win 5 matches this week.', period: 'weekly', objective: 5, progress: 2, xpReward: 260, startsAt: '2026-11-09T00:00:00Z', endsAt: '2026-11-16T00:00:00Z', claimed: false, active: true },
  { id: 'c-s1', name: 'Night sketch', description: 'Guess 10 hard words during the November event.', period: 'special', objective: 10, progress: 4, xpReward: 350, startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-11-30T23:59:59Z', claimed: false, active: true },
  { id: 'c-s2', name: 'Marathon', description: 'Play 20 matches during the November event.', period: 'special', objective: 20, progress: 11, xpReward: 400, startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-11-30T23:59:59Z', claimed: false, active: true },
];

export const REWARDS: RewardEntry[] = [
  { id: 'r1', userId: 'u-kai', label: 'Correct guess: bridge', xp: 15, at: '2026-11-11T09:41:00Z', kind: 'guess' },
  { id: 'r2', userId: 'u-kai', label: 'Correct guess: lantern', xp: 18, at: '2026-11-11T09:38:00Z', kind: 'guess' },
  { id: 'r3', userId: 'u-kai', label: 'Drawing turn, 4 guesses', xp: 24, at: '2026-11-11T09:33:00Z', kind: 'draw' },
  { id: 'r4', userId: 'u-kai', label: 'Match finished, 2nd place', xp: 35, at: '2026-11-11T09:28:00Z', kind: 'match' },
  { id: 'r5', userId: 'u-kai', label: 'Challenge: One more round', xp: 60, at: '2026-11-11T09:28:00Z', kind: 'challenge' },
  { id: 'r6', userId: 'u-kai', label: 'Achievement: Level 10', xp: 100, at: '2026-11-05T12:00:00Z', kind: 'achievement' },
  { id: 'r7', userId: 'u-kai', label: 'Correct guess: castle', xp: 15, at: '2026-11-10T21:14:00Z', kind: 'guess' },
  { id: 'r8', userId: 'u-kai', label: 'Match finished, 1st place', xp: 50, at: '2026-11-10T20:52:00Z', kind: 'match' },
];

export const LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, userId: 'u-kai', username: 'kai', avatarId: 'av-01', level: 31, xp: 59800, wins: 120, titleId: 't-artist' },
  { rank: 2, userId: 'u-maya', username: 'maya', avatarId: 'av-03', level: 28, xp: 51200, wins: 96, titleId: 't-wordsmith' },
  { rank: 3, userId: 'u-ines', username: 'ines', avatarId: 'av-02', level: 25, xp: 46200, wins: 88, titleId: 't-wordsmith' },
  { rank: 4, userId: 'u-leo', username: 'leo', avatarId: 'av-05', level: 22, xp: 38400, wins: 71, titleId: 't-guardian' },
  { rank: 5, userId: 'u-anna', username: 'anna', avatarId: 'av-06', level: 19, xp: 31500, wins: 62, titleId: 't-streak' },
  { rank: 6, userId: 'u-sana', username: 'sana', avatarId: 'av-07', level: 17, xp: 26100, wins: 44, titleId: null },
  { rank: 7, userId: 'u-tomas', username: 'tomas', avatarId: 'av-04', level: 14, xp: 19800, wins: 30, titleId: null },
  { rank: 8, userId: 'u-noor', username: 'noor', avatarId: 'av-09', level: 12, xp: 16700, wins: 22, titleId: null },
  { rank: 9, userId: 'u-pedro', username: 'pedro', avatarId: 'av-11', level: 7, xp: 8200, wins: 10, titleId: null },
  { rank: 10, userId: 'u-guest', username: 'you', avatarId: 'av-08', level: 6, xp: 7400, wins: 8, titleId: null },
];

export const ARTICLES: Article[] = [
  {
    id: 'post-1', slug: 'guess-faster', title: 'How to guess faster', category: 'Guides', tags: ['tips', 'guessing'],
    excerpt: 'Small habits that help you read a drawing before it is finished.',
    body: [
      'Most players wait for a drawing to be complete before they start guessing. The faster approach is to guess from the first few strokes.',
      'Watch the order of lines. People usually draw the largest shape first. A big circle early on often means a face, a clock, or a planet.',
      'Use the letter count. The hint shows how many letters the word has. Type short, common words that fit the count instead of waiting for certainty.',
      'Check the category of recent words. Rooms tend to drift through similar topics. If the last two words were animals, try an animal first.',
      'You are not penalized for wrong guesses, so guess early and often. Speed comes from volume, not from being right on the first try.',
    ],
    status: 'published', author: 'maya', cover: 'guess', createdAt: '2026-10-20T10:00:00Z', publishAt: '2026-10-20T10:00:00Z',
    seoTitle: 'How to guess faster in DrawSpace', seoDescription: 'Practical habits for reading drawings early and guessing words before the timer runs out.', views: 2140,
  },
  {
    id: 'post-2', slug: 'draw-clearer', title: 'Draw so people understand', category: 'Guides', tags: ['drawing', 'tips'],
    excerpt: 'You do not need to be an artist. You need to be readable.',
    body: [
      'A good DrawSpace drawing is not a beautiful drawing. It is a drawing that removes wrong answers quickly.',
      'Start with the silhouette. If the word is guitar, draw the body outline first. Details like strings come later.',
      'Use scale. Draw the subject large enough to fill the canvas. Tiny drawings are hard to read on phones.',
      'Add one defining detail. A cat needs whiskers. A rocket needs fins and a flame. One strong cue beats ten small ones.',
      'Avoid writing words or letters. It is against the rules and it ends the fun for everyone.',
    ],
    status: 'published', author: 'kai', cover: 'draw', createdAt: '2026-10-28T10:00:00Z', publishAt: '2026-10-28T10:00:00Z',
    seoTitle: 'How to draw clearly in DrawSpace', seoDescription: 'Simple drawing techniques that make your words easy to guess.', views: 1860,
  },
  {
    id: 'post-3', slug: 'learn-english-while-playing', title: 'Learning English while playing', category: 'Learning', tags: ['english', 'vocabulary'],
    excerpt: 'Why a drawing game is a surprisingly good vocabulary trainer.',
    body: [
      'Every round of DrawSpace connects a word to an image, a timer, and a small moment of pressure. That combination is close to how flashcards work, except the picture is drawn live.',
      'When you guess a word, you see it spelled correctly in the chat. When you draw it, you have to recall its meaning first. Both directions strengthen memory.',
      'After each match, review the words you missed. The results screen lists every word from the game. Say each one out loud once.',
      'Hard mode introduces less common words like periscope and archipelago. Treat them as vocabulary sets: play a few rounds, then review the list.',
    ],
    status: 'published', author: 'sana', cover: 'learn', createdAt: '2026-11-02T10:00:00Z', publishAt: '2026-11-02T10:00:00Z',
    seoTitle: 'Learning English vocabulary with DrawSpace', seoDescription: 'How drawing and guessing games help you remember English words.', views: 1420,
  },
  {
    id: 'post-4', slug: 'november-update', title: 'November update: challenges and titles', category: 'News', tags: ['update', 'challenges'],
    excerpt: 'New weekly challenges, two special events, and a titles gallery.',
    body: [
      'This update adds a challenges page with daily, weekly, and special objectives. Completing them grants bonus XP.',
      'The titles gallery is live. Titles are earned through milestones and can be shown next to your name.',
      'We also tuned the XP curve. Early levels now take slightly less XP, so new players reach level 5 faster.',
    ],
    status: 'published', author: 'admin', cover: 'update', createdAt: '2026-11-05T10:00:00Z', publishAt: '2026-11-05T10:00:00Z',
    seoTitle: 'DrawSpace November update', seoDescription: 'Challenges, titles, and a smoother XP curve in the November update.', views: 980,
  },
  {
    id: 'post-5', slug: 'room-etiquette', title: 'Room etiquette', category: 'Community', tags: ['community', 'rules'],
    excerpt: 'A few shared habits that keep rooms fun for everyone.',
    body: [
      'Do not type the answer in chat when you are the drawer. Do not paste it from a translator either.',
      'If you guessed correctly, let others find it. The scoreboard already shows that you got it.',
      'Keep usernames and drawings friendly. Reports are reviewed by moderators.',
      'If a room is private, share the code only with people you invited.',
    ],
    status: 'published', author: 'leo', cover: 'community', createdAt: '2026-11-08T10:00:00Z', publishAt: '2026-11-08T10:00:00Z',
    seoTitle: 'DrawSpace room etiquette', seoDescription: 'Shared habits that keep DrawSpace rooms fun and fair.', views: 760,
  },
  {
    id: 'post-6', slug: 'word-bank-behind-the-scenes', title: 'Behind the word bank', category: 'News', tags: ['words', 'design'],
    excerpt: 'How words are chosen, rated, and reviewed.',
    body: [
      'Every word in DrawSpace passes three checks: it is drawable in under a minute, it has a clear silhouette, and it is common enough to be fair.',
      'Difficulty is rated by how quickly players guess it in test rooms, not by word length.',
      'Draft: this article will be expanded with community submissions.',
    ],
    status: 'draft', author: 'maya', cover: 'words', createdAt: '2026-11-09T10:00:00Z', publishAt: '2026-11-20T10:00:00Z',
    seoTitle: 'Behind the DrawSpace word bank', seoDescription: 'How the DrawSpace word bank is built and rated.', views: 0,
  },
];

export const ADS: AdUnit[] = [
  { id: 'ad-1', name: 'Landing footer banner', placement: 'landing', enabled: true, devices: ['desktop', 'mobile', 'tablet'], startDate: '2026-11-01', endDate: '2026-11-30', priority: 1, body: 'Advertisement' },
  { id: 'ad-2', name: 'Blog sidebar', placement: 'blog', enabled: true, devices: ['desktop'], startDate: '2026-11-01', endDate: '2026-12-15', priority: 2, body: 'Advertisement' },
  { id: 'ad-3', name: 'Blog inline', placement: 'blog', enabled: false, devices: ['mobile', 'tablet'], startDate: '2026-11-10', endDate: '2026-11-25', priority: 3, body: 'Advertisement' },
  { id: 'ad-4', name: 'Holiday campaign', placement: 'landing', enabled: false, devices: ['desktop', 'mobile'], startDate: '2026-12-01', endDate: '2026-12-31', priority: 4, body: 'Advertisement' },
];

export const MEDIA: MediaAsset[] = [
  { id: 'md-1', name: 'hero-preview.png', kind: 'image', size: 184320, createdAt: '2026-10-18T10:00:00Z', url: '' },
  { id: 'md-2', name: 'avatar-orbit.svg', kind: 'avatar', size: 4096, createdAt: '2026-10-18T10:00:00Z', url: '' },
  { id: 'md-3', name: 'avatar-prism.svg', kind: 'avatar', size: 4096, createdAt: '2026-10-18T10:00:00Z', url: '' },
  { id: 'md-4', name: 'blog-guess-faster.png', kind: 'image', size: 152000, createdAt: '2026-10-20T10:00:00Z', url: '' },
  { id: 'md-5', name: 'blog-draw-clearer.png', kind: 'image', size: 148000, createdAt: '2026-10-28T10:00:00Z', url: '' },
  { id: 'md-6', name: 'press-kit.pdf', kind: 'document', size: 890000, createdAt: '2026-11-01T10:00:00Z', url: '' },
  { id: 'md-7', name: 'og-default.png', kind: 'image', size: 96000, createdAt: '2026-11-03T10:00:00Z', url: '' },
  { id: 'md-8', name: 'avatar-nova.svg', kind: 'avatar', size: 4096, createdAt: '2026-11-04T10:00:00Z', url: '' },
];

export const AUDIT: AuditEntry[] = [
  { id: 'au-1', admin: 'admin', action: 'word.create', target: 'kaleidoscope', at: '2026-11-10T16:20:00Z', before: '', after: 'difficulty: hard', status: 'success' },
  { id: 'au-2', admin: 'maya', action: 'article.publish', target: 'room-etiquette', at: '2026-11-08T10:00:00Z', before: 'draft', after: 'published', status: 'success' },
  { id: 'au-3', admin: 'leo', action: 'user.suspend', target: 'ilya', at: '2026-11-02T12:00:00Z', before: 'active', after: 'suspended', status: 'success' },
  { id: 'au-4', admin: 'admin', action: 'xp.update', target: 'correctGuess', at: '2026-11-01T09:00:00Z', before: '10', after: '15', status: 'success' },
  { id: 'au-5', admin: 'maya', action: 'challenge.create', target: 'Night sketch', at: '2026-11-01T08:30:00Z', before: '', after: 'special, 350 XP', status: 'success' },
  { id: 'au-6', admin: 'admin', action: 'role.assign', target: 'leo', at: '2026-10-30T14:00:00Z', before: 'player', after: 'moderator', status: 'success' },
  { id: 'au-7', admin: 'sana', action: 'report.resolve', target: 'rp-2', at: '2026-10-29T11:00:00Z', before: 'open', after: 'resolved', status: 'success' },
  { id: 'au-8', admin: 'admin', action: 'ad.enable', target: 'Landing footer banner', at: '2026-11-01T10:00:00Z', before: 'disabled', after: 'enabled', status: 'success' },
  { id: 'au-9', admin: 'maya', action: 'title.create', target: 'Champion', at: '2026-10-27T15:00:00Z', before: '', after: '100 wins, 200 XP', status: 'success' },
  { id: 'au-10', admin: 'admin', action: 'settings.update', target: 'guestPlay', at: '2026-10-25T09:00:00Z', before: 'false', after: 'true', status: 'success' },
  { id: 'au-11', admin: 'leo', action: 'user.ban', target: 'greta', at: '2026-10-20T09:00:00Z', before: 'active', after: 'banned', status: 'success' },
  { id: 'au-12', admin: 'maya', action: 'word.update', target: 'periscope', at: '2026-10-19T13:00:00Z', before: 'hint: none', after: 'hint added', status: 'failed' },
];

export const REPORTS: Report[] = [
  { id: 'rp-1', type: 'drawing', target: 'Room K7Q2MZ, round 3', reporter: 'tomas', reason: 'Inappropriate drawing', at: '2026-11-11T08:12:00Z', status: 'open', detail: 'Player drew explicit content during a public room round.' },
  { id: 'rp-2', type: 'chat', target: 'Room F3LM9A', reporter: 'ines', reason: 'Answer sharing', at: '2026-11-10T21:40:00Z', status: 'open', detail: 'A player typed the answer in chat after guessing correctly.' },
  { id: 'rp-3', type: 'username', target: 'user greta', reporter: 'anna', reason: 'Offensive name', at: '2026-10-19T10:00:00Z', status: 'resolved', detail: 'Username contained a slur. Account banned.' },
  { id: 'rp-4', type: 'room', target: 'Room X99D2K', reporter: 'noor', reason: 'Spam room names', at: '2026-11-09T18:22:00Z', status: 'open', detail: 'Same host creating rooms with advertising names repeatedly.' },
  { id: 'rp-5', type: 'chat', target: 'Room B2H8QE', reporter: 'kai', reason: 'Harassment', at: '2026-11-08T19:05:00Z', status: 'dismissed', detail: 'Argument between players, no rule violation found.' },
  { id: 'rp-6', type: 'drawing', target: 'Room M4T6ZA', reporter: 'pedro', reason: 'Writing the word', at: '2026-11-07T17:31:00Z', status: 'resolved', detail: 'Drawer wrote the word on canvas. Warning issued.' },
];

export const SEO_RECORDS: SeoRecord[] = [
  { route: '/', title: 'DrawSpace · Draw, guess, learn English', description: 'A multiplayer drawing and guessing game. Play free in your browser, no account needed.', canonical: 'https://drawspace.cloud/', ogTitle: 'DrawSpace', ogDescription: 'Draw, guess, and learn English with friends.', robots: 'index', structuredData: '{"@type":"VideoGame","name":"DrawSpace"}' },
  { route: '/play', title: 'Play · DrawSpace', description: 'Start a game as a guest. Pick a name, choose an avatar, and join a room.', canonical: 'https://drawspace.cloud/play', ogTitle: 'Play DrawSpace', ogDescription: 'No account needed. Pick a name and play.', robots: 'index', structuredData: '' },
  { route: '/leaderboard', title: 'Leaderboard · DrawSpace', description: 'The top DrawSpace players by XP.', canonical: 'https://drawspace.cloud/leaderboard', ogTitle: 'DrawSpace leaderboard', ogDescription: 'Top players by XP.', robots: 'index', structuredData: '' },
  { route: '/blog', title: 'Blog · DrawSpace', description: 'Guides, news, and vocabulary tips from the DrawSpace team.', canonical: 'https://drawspace.cloud/blog', ogTitle: 'DrawSpace blog', ogDescription: 'Guides and news.', robots: 'index', structuredData: '' },
];

export const REDIRECTS: RedirectRule[] = [
  { id: 'rd-1', from: '/home', to: '/', code: 301, hits: 342 },
  { id: 'rd-2', from: '/game', to: '/play', code: 301, hits: 128 },
  { id: 'rd-3', from: '/articles', to: '/blog', code: 302, hits: 45 },
];

export const CRM_MESSAGES: CrmMessage[] = [
  { id: 'cm-1', segment: 'All players', subject: 'November challenges are live', body: 'Daily and weekly challenges are now available. Complete them for bonus XP.', sentAt: '2026-11-05T10:00:00Z', recipients: 1284, status: 'sent' },
  { id: 'cm-2', segment: 'Inactive 30 days', subject: 'Your room misses you', body: 'New words and a smoother XP curve since your last match. Come play a round.', sentAt: '2026-11-08T10:00:00Z', recipients: 214, status: 'sent' },
  { id: 'cm-3', segment: 'Level 10+', subject: 'Hard mode tournament', body: 'Draft announcement for the December hard mode event.', sentAt: '', recipients: 0, status: 'draft' },
];

export const GAME_CONFIG: GameConfig = {
  minPlayers: 2, maxPlayers: 12, defaultRounds: 4, minRoundSeconds: 30, maxRoundSeconds: 120,
  wordChoiceCount: 3, wordChoiceSeconds: 15, hintReveal: true, skipVoteRatio: 0.5, allowGuests: true,
};

export const XP_CONFIG: XpConfig = {
  correctGuess: 15, firstGuessBonus: 5, drawingPerGuess: 6, winBonus: 30,
  challengeMultiplier: 1, levelBase: 100, levelGrowth: 1.18,
};

export const SYSTEM_SETTINGS: SystemSettings = {
  siteName: 'DrawSpace', tagline: 'Draw, guess, learn English.', maintenance: false,
  registrationOpen: true, guestPlay: true, defaultLocale: 'en-US', contactEmail: 'hello@drawspace.cloud',
};

export const PERMISSIONS: PermissionDef[] = [
  { id: 'users.view', label: 'View users', group: 'Users' },
  { id: 'users.edit', label: 'Edit users', group: 'Users' },
  { id: 'users.suspend', label: 'Suspend or ban', group: 'Users' },
  { id: 'roles.manage', label: 'Manage roles', group: 'Users' },
  { id: 'rooms.view', label: 'View rooms', group: 'Game' },
  { id: 'rooms.close', label: 'Close rooms', group: 'Game' },
  { id: 'words.manage', label: 'Manage word bank', group: 'Game' },
  { id: 'config.game', label: 'Game configuration', group: 'Game' },
  { id: 'config.xp', label: 'XP configuration', group: 'Game' },
  { id: 'moderation.handle', label: 'Handle reports', group: 'Community' },
  { id: 'crm.send', label: 'Send messages', group: 'Community' },
  { id: 'content.blog', label: 'Manage blog', group: 'Content' },
  { id: 'content.seo', label: 'Manage SEO', group: 'Content' },
  { id: 'content.ads', label: 'Manage ads', group: 'Content' },
  { id: 'content.media', label: 'Manage media', group: 'Content' },
  { id: 'rewards.manage', label: 'Titles and achievements', group: 'Rewards' },
  { id: 'challenges.manage', label: 'Manage challenges', group: 'Rewards' },
  { id: 'analytics.view', label: 'View analytics', group: 'Operations' },
  { id: 'audit.view', label: 'View audit logs', group: 'Operations' },
  { id: 'settings.manage', label: 'System settings', group: 'Operations' },
];

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  superadmin: PERMISSIONS.map((p) => p.id),
  admin: PERMISSIONS.filter((p) => p.id !== 'roles.manage').map((p) => p.id),
  moderator: ['users.view', 'users.suspend', 'rooms.view', 'rooms.close', 'moderation.handle', 'audit.view'],
  support: ['users.view', 'rooms.view', 'crm.send', 'moderation.handle'],
};

export const PUBLIC_ROOMS: Room[] = [
  { code: 'K7Q2MZ', name: 'English practice', visibility: 'public', hasPassword: false, hostId: 'u-kai', players: [], settings: { name: 'English practice', visibility: 'public', password: '', maxPlayers: 8, rounds: 4, roundSeconds: 80, difficulty: 'medium', wordMode: 'all', customWords: [] }, status: 'waiting', createdAt: '2026-11-11T09:00:00Z' },
  { code: 'F3LM9A', name: 'Quick sketches', visibility: 'public', hasPassword: false, hostId: 'u-ines', players: [], settings: { name: 'Quick sketches', visibility: 'public', password: '', maxPlayers: 6, rounds: 3, roundSeconds: 60, difficulty: 'easy', wordMode: 'easy', customWords: [] }, status: 'playing', createdAt: '2026-11-11T09:20:00Z' },
  { code: 'B2H8QE', name: 'Hard words only', visibility: 'public', hasPassword: true, password: 'night', hostId: 'u-anna', players: [], settings: { name: 'Hard words only', visibility: 'public', password: 'night', maxPlayers: 10, rounds: 5, roundSeconds: 90, difficulty: 'hard', wordMode: 'hard', customWords: [] }, status: 'waiting', createdAt: '2026-11-11T08:45:00Z' },
  { code: 'M4T6ZA', name: 'Beginners welcome', visibility: 'public', hasPassword: false, hostId: 'u-noor', players: [], settings: { name: 'Beginners welcome', visibility: 'public', password: '', maxPlayers: 8, rounds: 4, roundSeconds: 90, difficulty: 'easy', wordMode: 'easy', customWords: [] }, status: 'waiting', createdAt: '2026-11-11T09:35:00Z' },
  { code: 'X99D2K', name: 'Late night drawings', visibility: 'public', hasPassword: false, hostId: 'u-tomas', players: [], settings: { name: 'Late night drawings', visibility: 'public', password: '', maxPlayers: 12, rounds: 6, roundSeconds: 75, difficulty: 'medium', wordMode: 'all', customWords: [] }, status: 'playing', createdAt: '2026-11-11T09:10:00Z' },
];

export const BOT_PLAYERS = [
  { id: 'bot-1', username: 'pixelbot', avatarId: 'av-04' },
  { id: 'bot-2', username: 'inkling', avatarId: 'av-06' },
  { id: 'bot-3', username: 'doodlebee', avatarId: 'av-09' },
];

export const ANALYTICS = {
  dau: [820, 860, 910, 880, 940, 1010, 980, 1050, 1120, 1090, 1160, 1210, 1180, 1284],
  matches: [210, 240, 260, 250, 280, 310, 300, 330, 350, 340, 370, 390, 380, 412],
  signups: [24, 31, 28, 35, 40, 38, 44, 41, 47, 52, 49, 55, 60, 58],
  retention: 42,
  avgMatchMinutes: 11.5,
  wordsGuessed: 18420,
  topWords: [
    { word: 'cat', guesses: 412 }, { word: 'house', guesses: 380 }, { word: 'rocket', guesses: 341 },
    { word: 'guitar', guesses: 322 }, { word: 'pizza', guesses: 305 }, { word: 'castle', guesses: 288 },
  ],
  locales: [
    { locale: 'en-US', share: 38 }, { locale: 'en-GB', share: 12 }, { locale: 'fr', share: 11 },
    { locale: 'es', share: 10 }, { locale: 'de', share: 8 }, { locale: 'pt-BR', share: 8 },
    { locale: 'ar', share: 7 }, { locale: 'ru', share: 6 },
  ],
};
