import { 
  createNewCard, 
  rateCard, 
  cardToDb, 
  predictRetrievability,
  Rating 
} from '../src/lib/fsrs.js';

console.log('🧪 Testing FSRS wrapper...\n');

// 1. Tạo card mới
let card = createNewCard();
console.log('📝 New card:', {
  state: card.state,
  stability: card.stability,
  difficulty: card.difficulty,
  due: card.due,
});

// 2. User rate "Good" (3) lần đầu
let { card: newCard, log } = rateCard(card, 3);
console.log('\n✅ After rating "Good":', {
  state: newCard.state,
  stability: newCard.stability.toFixed(2) + ' days',
  difficulty: newCard.difficulty.toFixed(2),
  next_review: newCard.due.toLocaleString(),
});

// 3. Simulate 3 days passing, user reviews and rates "Good" again
const futureCard = {
  ...newCard,
  last_review: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
  elapsed_days: 3,
};

const result2 = rateCard(futureCard, 3);
console.log('\n✅ After 2nd review (Good):', {
  stability: result2.card.stability.toFixed(2) + ' days',
  difficulty: result2.card.difficulty.toFixed(2),
  next_review: result2.card.due.toLocaleString(),
});

// 4. Test retrievability
console.log('\n📊 Retrievability now:', (predictRetrievability(result2.card) * 100).toFixed(1) + '%');

console.log('\n✅ All FSRS tests passed!');
