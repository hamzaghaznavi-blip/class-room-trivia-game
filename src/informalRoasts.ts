/** Roman-Urdu (Karachi-style banter) + Roman Punjabi (female-voice lines). Generic, no names. */

import type { RoastVoiceKind } from './informalRoastVoice';

export type InformalRoast = { text: string; voice: RoastVoiceKind };

const URDU_MALE: string[] = [
  'Abay ye tou theek ker le, dukkan!',
  'Arrey bhai, dimagh ghar pe chhor aaya tha?',
  'Itna easy tha — yeh to bachon wala sawal tha!',
  'Chal chal, zyada hero mat ban.',
  'Ajeeb scene hai — yeh bhi galat?',
  'Ammi ko pata chal gaya to kya hoga socha hai?',
  'Thori si mehnat kar le, setting lag rahi hai.',
  'Yeh answer tou notes mein likha tha na?',
  'Haw haye! Dosto ke saamne kya kar diya?',
  'Dekh kar click kar — aankhein decoration ke liye hain?',
  'Aisa galat? Matlab dil se nahi padha.',
  'Chalo koi nahi, agla round mein sudhar jana.',
  'Itna confidence, phir bhi tick galat?',
  'Lagta hai neend poori nahi hui.',
  'Aaj brain ka day off hai?',
  'Yeh tou ghalat fehmi ka shikaar ho gaye.',
  'Thora focus — yeh easy pickings thi.',
  'Boss, yeh tou common sense tha.',
  'Kya scene hai yaar, yeh bhi miss?',
  'Aise kaise? Padhai ka waqt nahi mila?',
  'Relax kar, lekin answer tou sahi hota.',
  'Dosto ne hasna shuru kar diya hoga.',
  'Ajeeb kismet — itna seedha sawal.',
  'Dimagh ka dahi mat bana, simple tha.',
  'Lagta hai mind elsewhere hai — wapas aao.',
  'Abay tu engineer banega? Pehle yeh tou theek kar.',
  'Oye hoye — itna seedha tha, phir bhi?',
  'Dimaag ka GPS off hai kya?',
  'Yaar yeh tou ghalat fehmi se bhi seedha tha.',
  'Chup chaap corner mein baith — agla try.',
  'Itni jaldi galat? Record toot gaya.',
  'Scene achha tha, answer barbaad.',
  'Bhai setting strong, output weak.',
  'Aisa lagta hai guess bhi ignore kar diya.',
  'Thora dimagh lagata tou scene set tha.',
  'Abay focus — yeh tou one-tap tha.',
  'Lagta hai padhai ka Wi‑Fi disconnect hai.',
  'Yeh miss? Team chat ab full roast mode.',
  'Confidence 100, accuracy 0 — kya combo hai.',
  'Chalo, agla question se comeback.',
  'Dimaag ki batti jalao — yeh tou easy tha.',
  'Kya scene — yeh bhi slip ho gaya?',
  'Thora focus — warna team hasayegi.',
  'Boss, yeh tou common knowledge thi.',
  'Relax — lekin agla waqt tight karna.',
  'Ajeeb — yeh tou seedha tha.',
  'Aisa galat? Matlab revision time.',
];

/** Punjabi-flavoured (Roman script) — read with female voice where available */
const PUNJABI_FEMALE: string[] = [
  'Oye ki kitta aa? Itna easy si!',
  'Hun sab hasse paye ne — koi galat jawab!',
  'Chal chal, zyada smart ban na — phir vi galat!',
  'Aise vi galat? Dimaag kithe reh gaya?',
  'Thora focus maar, scene set tha.',
  'Oye hoye — itna seedha tha, phir bhi?',
  'Hun CEO vekh ke hasu ge, tension na le!',
  'Kya baat aa, yaar — yeh vi miss?',
  'Ajeeb — yeh taan bachpan wala sawal si.',
  'Thori si tension, zyada galat?',
  'Lagge aa luck vi side le gayi.',
  'Simple gal si — phir vi galat?',
  'Scene on hai lekin answer off aa.',
  'Dosto ne hasna shuru kar ditta hoga.',
  'Ajeeb kismet — itna seedha sawal.',
  'Thora dimagh lagaunda taan set si.',
  'Confidence full, accuracy zero — ki combo aa?',
  'Chalo koi nahi — agla chance pakka.',
  'Aankh band karke vi sahi lag sakda si.',
  'Yeh taan basic si — refresh kar apna.',
  'Ajeeb — yeh taan suneya sunaya si.',
  'Thori si mehnat kar le, setting lag rahi aa.',
  'Oye hoye — pressure ch galat?',
  'Hun team chat full roast mode aa.',
  'Bhai setting strong, output weak aa.',
];

export function pickRandomInformalRoast(): InformalRoast {
  const usePunjabi = Math.random() < 0.38;
  const pool = usePunjabi ? PUNJABI_FEMALE : URDU_MALE;
  const voice: RoastVoiceKind = usePunjabi ? 'punjabi-female' : 'urdu-male';
  const text = pool[Math.floor(Math.random() * pool.length)] ?? URDU_MALE[0]!;
  return { text, voice };
}
