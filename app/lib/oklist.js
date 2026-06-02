import { senderList } from "./senderList.js";

// OK list — senders whose mail is allowed through and labeled `..OK`.
const ok = senderList("oklist.json");

export const loadOklist = ok.load;
export const saveOklist = ok.save;
export const addToOklist = ok.add;
export const removeFromOklist = ok.remove;
export const isOklisted = (fromEmail, fromName = null) => !!ok.match(fromEmail, fromName);
