export const letters = ['R', 'I', 'A', 'S', 'E', 'C'];
export const strands = ['STEM', 'ABM', 'HUMSS', 'TVL', 'GAS'];
export const letterToStrands = { R: ['TVL'], I: ['STEM'], A: ['HUMSS'], S: ['HUMSS'], E: ['ABM'], C: ['ABM', 'GAS'] };
const prompts = {
  R: ['I like building or repairing things.', 'I enjoy working with tools.', 'I prefer practical hands-on activities.', 'I like operating machines.', 'I enjoy outdoor physical work.', 'I like making objects work.', 'I enjoy learning how equipment works.'],
  I: ['I enjoy solving difficult problems.', 'I like investigating how things work.', 'I enjoy science experiments.', 'I look for evidence before deciding.', 'I like analyzing information.', 'I enjoy mathematics and logic.', 'I ask questions about the world.'],
  A: ['I enjoy drawing or designing.', 'I like writing creatively.', 'I enjoy music, theater, or performance.', 'I prefer original approaches.', 'I notice color and visual detail.', 'I enjoy expressing ideas artistically.', 'I like imaginative projects.'],
  S: ['I enjoy helping people learn.', 'I listen carefully to others.', 'I like working in a team.', 'I enjoy supporting my community.', 'I am patient with people.', 'I like teaching or explaining.', 'I care about people’s wellbeing.'],
  E: ['I enjoy leading a group.', 'I like persuading people.', 'I am comfortable making decisions.', 'I enjoy planning projects.', 'I like starting new ventures.', 'I enjoy presenting ideas.', 'I take initiative.'],
  C: ['I like organizing information.', 'I pay attention to details.', 'I enjoy following clear procedures.', 'I keep accurate records.', 'I like schedules and routines.', 'I check work carefully.', 'I enjoy working with numbers.']
};
export const items = letters.flatMap(letter => prompts[letter].map((text, i) => ({ id: `${letter}${i + 1}`, text, letter })));
