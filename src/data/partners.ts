import type { TransferBonus, TransferPartner } from '../lib/types';

/**
 * Chase Ultimate Rewards transfer partners as compiled on 2026-11-18 from:
 *  - The Points Party partner guide (updated 2026-10-01)
 *  - AwardWallet transfer times table (updated 2026-11-17)
 * Chase does not publish a public machine-readable list, so this is a SEED that the
 * user verifies against their own Ultimate Rewards "Transfer to travel partners" screen.
 * Ratios here are the default; card-specific overrides live in cards.ts.
 */
const SEEDED = '2026-11-18';
const SRC_PARTY = 'https://thepointsparty.com/chase-ultimate-rewards-transfer-partners';
const SRC_AW = 'https://awardwallet.com/mile-transfer-times?program=Chase';

const p = (
  id: string,
  name: string,
  program: string,
  type: 'airline' | 'hotel',
  alliance: TransferPartner['alliance'],
  transferTime: string,
  bookingUrl: string,
  notes: string,
  seedConfidence: TransferPartner['seedConfidence'] = 'confirmed',
): TransferPartner => ({
  id,
  name,
  program,
  type,
  alliance,
  ratio: { chase: 1, partner: 1 },
  minTransfer: 1000,
  increment: 1000,
  transferTime,
  bookingUrl,
  notes,
  seedConfidence,
  sourceUrls: seedConfidence === 'confirmed' ? [SRC_PARTY, SRC_AW] : [SRC_AW],
  seededAt: SEEDED,
  active: true,
});

export const SEED_PARTNERS: TransferPartner[] = [
  p('aer-lingus', 'Aer Lingus', 'AerClub (Avios)', 'airline', 'oneworld', 'Usually instant', 'https://www.aerlingus.com/travel-information/aerclub/', 'Avios can move between Aer Lingus, British Airways and Iberia accounts.'),
  p('aeroplan', 'Air Canada', 'Aeroplan', 'airline', 'Star Alliance', 'Usually under an hour', 'https://www.aircanada.com/aeroplan/redeem/', 'Partner awards on Star Alliance carriers (e.g. United, ANA, Lufthansa) use a published distance-based chart; Air Canada flights are dynamic.'),
  p('flying-blue', 'Air France / KLM', 'Flying Blue', 'airline', 'SkyTeam', 'Usually instant', 'https://wwws.airfrance.us/', 'Dynamic pricing; monthly "Promo Rewards" discounts. Carrier surcharges can apply.'),
  p('british-airways', 'British Airways', 'British Airways Club (Avios)', 'airline', 'oneworld', 'Usually instant', 'https://www.britishairways.com/travel/redeem/execclub/', 'Distance-based partner pricing on oneworld carriers (American, Alaska, JAL, Qantas). BA-operated flights carry high surcharges.'),
  p('iberia', 'Iberia', 'Iberia Club (Avios)', 'airline', 'oneworld', 'Usually instant', 'https://www.iberia.com/us/iberiaplus/', 'Iberia-operated flights to Spain often have lower surcharges than BA.'),
  p('jetblue', 'JetBlue', 'TrueBlue', 'airline', null, 'Usually instant', 'https://www.jetblue.com/trueblue', 'Revenue-based: points track cash fares, typically ~1.2–1.4¢ per TrueBlue point.'),
  p('singapore', 'Singapore Airlines', 'KrisFlyer', 'airline', 'Star Alliance', 'About 1 day', 'https://www.singaporeair.com/en_UK/us/ppsclub-krisflyer/', 'Saver awards on Singapore Airlines; partner awards on Star Alliance carriers.'),
  p('southwest', 'Southwest', 'Rapid Rewards', 'airline', null, 'Usually instant', 'https://www.southwest.com/rapidrewards/', 'Revenue-based: points track cash fares. Strong SAN/LAX network to Hawaii, Mexico and domestic.'),
  p('united', 'United Airlines', 'MileagePlus', 'airline', 'Star Alliance', 'Usually instant', 'https://www.united.com/en/us/fly/mileageplus.html', 'Dynamic pricing on United flights; partner saver space bookable via united.com.'),
  p('virgin-atlantic', 'Virgin Atlantic', 'Flying Club', 'airline', 'SkyTeam', 'Usually instant', 'https://www.virginatlantic.com/flying-club', 'Can book partners such as Delta, Air France/KLM and ANA; Virgin-operated flights carry surcharges.'),
  p('cathay', 'Cathay Pacific', 'Cathay (Asia Miles)', 'airline', 'oneworld', 'Unknown', 'https://www.cathaypacific.com/cx/en_US/membership.html', 'REPORTED NEW PARTNER: listed by AwardWallet as added 2026-11-18. Not confirmed by a second source — verify in your Chase account before relying on it.', 'reported-new'),
  p('qantas', 'Qantas', 'Frequent Flyer', 'airline', 'oneworld', 'Unknown', 'https://www.qantas.com/us/en/frequent-flyer.html', 'REPORTED NEW PARTNER: listed by AwardWallet as added 2026-11-18. Not confirmed by a second source — verify in your Chase account before relying on it.', 'reported-new'),
  p('world-of-hyatt', 'Hyatt', 'World of Hyatt', 'hotel', null, 'Usually instant', 'https://world.hyatt.com/', 'Published category award chart. Reported 4:3 (1,000 → 750) for Sapphire Preferred / Ink Preferred from 2026-10-01; 1:1 for Sapphire Reserve cards. Card-specific ratio applied automatically.'),
  p('ihg', 'IHG', 'IHG One Rewards', 'hotel', null, 'Hours', 'https://www.ihg.com/onerewards/', 'Dynamic award pricing; 4th night free on reward stays for some cardholders.'),
  p('marriott', 'Marriott', 'Marriott Bonvoy', 'hotel', null, '1–2 days', 'https://www.marriott.com/loyalty.mi', 'Dynamic award pricing; 5th night free on 5-night award stays.'),
  p('wyndham', 'Wyndham', 'Wyndham Rewards', 'hotel', null, 'Unknown', 'https://www.wyndhamhotels.com/wyndham-rewards', 'Reported added early 2026. Tiered award pricing (go free) across Wyndham brands and Vacasa rentals.'),
];

/**
 * Transfer bonuses reported by third parties as of 2026-11-18.
 * They are seeded as NEEDS VERIFICATION: they only become "Verified active" after the
 * user confirms them on Chase's own transfer screen. Status is always computed from
 * dates, so these auto-expire.
 */
const SRC_BONUS = 'https://thepointsparty.com/articles/chase-transfer-bonuses-avios-ihg-wyndham-november-2026';
const bonus = (id: string, partnerId: string, pct: number, end: string, src: string, srcName: string, notes?: string): TransferBonus => ({
  id,
  partnerId,
  bonusPercent: pct,
  endDate: end,
  eligibility: 'Not stated by source. Check that the bonus appears on your Chase "Transfer to travel partners" screen.',
  targeted: false,
  sourceName: srcName,
  sourceUrl: src,
  reportedAt: SEEDED,
  notes,
  createdBy: 'seed',
});

export const SEED_BONUSES: TransferBonus[] = [
  bonus('seed-avios-ba-2026-11', 'british-airways', 30, '2026-12-01', SRC_BONUS, 'The Points Party (also AwardWallet)'),
  bonus('seed-avios-ib-2026-11', 'iberia', 30, '2026-12-01', SRC_BONUS, 'The Points Party (also AwardWallet)'),
  bonus('seed-avios-ei-2026-11', 'aer-lingus', 30, '2026-12-01', SRC_BONUS, 'The Points Party (also AwardWallet)'),
  bonus('seed-ihg-2026-11', 'ihg', 80, '2026-12-03', SRC_BONUS, 'The Points Party (also AwardWallet)', 'IHG uses dynamic pricing — compare the award price against cash before transferring.'),
  bonus('seed-wyndham-2026-11', 'wyndham', 30, '2026-12-03', SRC_BONUS, 'The Points Party (also AwardWallet)', 'Several outlets call this a weak use of Chase points; check the award price first.'),
  bonus(
    'seed-vs-2026-12',
    'virgin-atlantic',
    30,
    '2026-12-30',
    SRC_AW,
    'AwardWallet (single source)',
    'Source is internally inconsistent ("40%" vs "1,000 → 1,300"). Recorded as 30% pending verification — confirm the actual rate on Chase.',
  ),
];

export const PARTNER_SOURCES = [SRC_PARTY, SRC_AW, SRC_BONUS];
