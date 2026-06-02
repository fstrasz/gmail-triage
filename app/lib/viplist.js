import { senderList } from "./senderList.js";

// VIP list — senders whose mail is always kept and labeled `..VIP`.
const vip = senderList("viplist.json");

export const loadViplist = vip.load;
export const saveViplist = vip.save;
export const addToViplist = vip.add;
export const removeFromViplist = vip.remove;
export const isViplisted = (fromEmail, fromName = null) => !!vip.match(fromEmail, fromName);
