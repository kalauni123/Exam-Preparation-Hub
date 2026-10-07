/**
 * Helpers that fetch only the chapter files needed for a set of question ids or chapters.
 * @module features/qsource
 */
import { app } from '../state.js';
import { loadChapters } from '../bank/chapterLoader.js';
import { chapterOfQuestion } from './insights.js';

/**
 * Load questions by id (grouped per chapter; unknown/removed ids are skipped).
 * @param {string[]} ids @returns {Promise<object[]>} in the same order as `ids`
 */
export async function questionsByIds(ids) {
  const chIds = [...new Set(ids.map(chapterOfQuestion))].filter((c) => app.catalog.chapterById.has(c));
  const { questions } = await loadChapters(chIds.map((c) => app.catalog.chapterById.get(c)));
  const byId = new Map(questions.map((q) => [q.id, q]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

/**
 * Load all questions of chapters.
 * @param {string[]} chapterIds @returns {Promise<object[]>}
 */
export async function questionsOfChapters(chapterIds) {
  const chs = chapterIds.map((c) => app.catalog.chapterById.get(c)).filter((c) => c && c.questionCount > 0);
  const { questions } = await loadChapters(chs);
  return questions;
}
