// N1–N9 (brief §5). Each normalized value carries the rule code that produced it.
export { parseName, nameToken, firstToken } from './names';
export { normEmail, normPhone, normZip, normState } from './contact';
export { normAddress } from './address';
export { normDate, normDob, civilFromDays } from './dates';
export { normAmount } from './amount';
export { decodeBytes } from './encoding';
