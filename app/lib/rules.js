import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const RULES_PATH = path.join(process.cwd(), 'rules.json');

export function loadRules() {
  try { return JSON.parse(fs.readFileSync(RULES_PATH)); } catch { return []; }
}
export function saveRules(rules) {
  fs.writeFileSync(RULES_PATH, JSON.stringify(rules, null, 2));
}
export function addRule({ name, senders, subjects, label, skipInbox }) {
  const rules = loadRules();
  rules.push({
    id: randomUUID(),
    name: name || '',
    senders: senders || [],
    subjects: subjects || [],
    label,
    skipInbox: !!skipInbox,
    date: new Date().toISOString(),
  });
  saveRules(rules);
}
export function updateRule(id, updates) {
  const rules = loadRules();
  const idx = rules.findIndex(r => r.id === id);
  if (idx >= 0) rules[idx] = { ...rules[idx], ...updates };
  saveRules(rules);
}
export function deleteRule(id) {
  saveRules(loadRules().filter(r => r.id !== id));
}
