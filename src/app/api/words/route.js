import { getAllWordsCached } from "@/lib/words-cache";

export async function GET() {
  const data = await getAllWordsCached();

  // Group by level, then interleave
  const byLevel = { A1: [], A2: [], B1: [], B2: [], C1: [], C2: [] };
  for (const word of data) {
    const level = word.level || 'B1';
    if (byLevel[level]) byLevel[level].push(word);
    else byLevel.B1.push(word);
  }
  
  // Shuffle each level group
  for (const level in byLevel) {
    byLevel[level] = shuffle(byLevel[level]);
  }
  
  // Interleave: round-robin pick from each level
  const result = [];
  const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  let maxLen = Math.max(...Object.values(byLevel).map(arr => arr.length));
  
  for (let i = 0; i < maxLen; i++) {
    for (const level of levels) {
      if (byLevel[level][i]) result.push(byLevel[level][i]);
    }
  }

  return Response.json({ words: result, count: result.length });
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
