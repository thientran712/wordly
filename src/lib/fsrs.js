import { fsrs, generatorParameters, Rating, State, createEmptyCard } from "ts-fsrs";

// FSRS configuration
// Target retention 90% = user nhớ 90% từ đã học
const params = generatorParameters({
  requestRetention: 0.90,
  maximumInterval: 365,   // Tối đa 1 năm giữa các review
  enableFuzz: true,       // Add random ±5% to intervals (anti-clumping)
});

export const fsrsScheduler = fsrs(params);

/**
 * Tạo card mới (lần đầu user gặp từ)
 */
export function createNewCard() {
  return createEmptyCard();
}

/**
 * Convert FSRS card sang format DB
 */
export function cardToDb(card) {
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    state: stateToString(card.state),
    scheduled_days: card.scheduled_days,
    elapsed_days: card.elapsed_days,
    lapses: card.lapses,
    due_at: card.due.toISOString(),
    last_reviewed_at: card.last_review ? card.last_review.toISOString() : null,
    review_count: card.reps,
  };
}

/**
 * Convert DB record sang FSRS card
 */
export function dbToCard(dbProgress) {
  if (!dbProgress || dbProgress.state === 'new') {
    return createEmptyCard();
  }
  
  return {
    due: new Date(dbProgress.due_at),
    stability: dbProgress.stability || 0,
    difficulty: dbProgress.difficulty || 5.0,
    elapsed_days: dbProgress.elapsed_days || 0,
    scheduled_days: dbProgress.scheduled_days || 0,
    reps: dbProgress.review_count || 0,
    lapses: dbProgress.lapses || 0,
    state: stringToState(dbProgress.state),
    last_review: dbProgress.last_reviewed_at ? new Date(dbProgress.last_reviewed_at) : undefined,
  };
}

/**
 * Calculate next state cho card sau khi user rate
 * @param card - Current FSRS card
 * @param rating - 1=Again, 2=Hard, 3=Good, 4=Easy
 * @returns SchedulingInfo with new card state + review log
 */
export function rateCard(card, rating) {
  const now = new Date();
  const scheduling = fsrsScheduler.repeat(card, now);
  
  // FSRS rating mapping: 1=Again, 2=Hard, 3=Good, 4=Easy
  const ratingMap = {
    1: Rating.Again,
    2: Rating.Hard,
    3: Rating.Good,
    4: Rating.Easy,
  };
  
  const selectedScheduling = scheduling[ratingMap[rating]];
  
  return {
    card: selectedScheduling.card,
    log: selectedScheduling.log,
  };
}

/**
 * Predict retrievability (% user còn nhớ NOW)
 */
export function predictRetrievability(card) {
  if (!card.last_review) return 0;
  
  const now = new Date();
  const elapsed = (now - new Date(card.last_review)) / (1000 * 60 * 60 * 24); // days
  
  if (card.stability === 0) return 0;
  
  return Math.pow(1 + elapsed / (9 * card.stability), -1);
}

/**
 * Check if card cần review NGAY
 */
export function isDueNow(card) {
  if (!card.due) return true; // New card
  return new Date(card.due) <= new Date();
}

// Helpers
function stateToString(state) {
  const map = {
    [State.New]: 'new',
    [State.Learning]: 'learning',
    [State.Review]: 'review',
    [State.Relearning]: 'relearning',
  };
  return map[state] || 'new';
}

function stringToState(str) {
  const map = {
    'new': State.New,
    'learning': State.Learning,
    'review': State.Review,
    'relearning': State.Relearning,
  };
  return map[str] || State.New;
}

export { Rating, State };
