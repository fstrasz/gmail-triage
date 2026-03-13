import fs from "fs";
import path from "path";

const REVIEW_PATH = path.join(process.cwd(), "review.json");

export function loadReview() {
  try { return JSON.parse(fs.readFileSync(REVIEW_PATH)); } catch { return []; }
}
export function saveReview(list) {
  fs.writeFileSync(REVIEW_PATH, JSON.stringify(list, null, 2));
}
export function addToReview(item) {
  const list = loadReview().filter(e => e.id !== item.id); // replace if re-analyzed
  list.unshift(item);
  saveReview(list);
}
export function updateReview(id, patch) {
  saveReview(loadReview().map(e => e.id === id ? { ...e, ...patch } : e));
}
export function removeFromReview(id) {
  saveReview(loadReview().filter(e => e.id !== id));
}
