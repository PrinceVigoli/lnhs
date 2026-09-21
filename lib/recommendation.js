import { letters, strands, letterToStrands, items } from '../config/riasec.js';
export function scoreAnswers(answers) {
  const scores = Object.fromEntries(letters.map(l => [l, 0]));
  for (const item of items) if (String(answers[item.id]) === 'yes' || answers[item.id] === true || answers[item.id] === 1) scores[item.letter]++;
  return scores;
}
export function computeCompatibility(scores = {}) {
  const strandScores = Object.fromEntries(strands.map(s => [s, 0]));
  const maxPossible = Object.fromEntries(strands.map(s => [s, 0]));
  const perLetter = items.reduce((m, i) => (m[i.letter] = (m[i.letter] || 0) + 1, m), {});
  for (const letter of letters) {
    const mapped = letterToStrands[letter] || [];
    for (const strand of mapped) { strandScores[strand] += Number(scores[letter] || 0) / mapped.length; maxPossible[strand] += (perLetter[letter] || 0) / mapped.length; }
  }
  const percentages = Object.fromEntries(strands.map(s => [s, maxPossible[s] ? Math.round(strandScores[s] / maxPossible[s] * 100) : 0]));
  const order = ['STEM', 'ABM', 'HUMSS', 'TVL', 'GAS'];
  const ranked = [...strands].sort((a, b) => percentages[b] - percentages[a] || order.indexOf(a) - order.indexOf(b));
  return { strandScores, maxPossible, percentages, ranked, recommended: ranked.every(s => percentages[s] === 0) ? 'GAS' : ranked[0] };
}
