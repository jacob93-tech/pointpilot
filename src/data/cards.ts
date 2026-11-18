import type { CardId, ChaseCard } from '../lib/types';

/**
 * Chase card redemption rules, compiled 2026-11-18 from public reporting
 * (NerdWallet, The Points Guy, One Mile at a Time, AwardWallet).
 * Chase changes these; every number is editable in Settings and the UI tells
 * the user to confirm the rate shown in Chase Travel for each specific booking.
 */
const HYATT_4_3 = { 'world-of-hyatt': { chase: 4, partner: 3 } };

export const CARDS: ChaseCard[] = [
  {
    id: 'csp',
    name: 'Chase Sapphire Preferred',
    transferEligible: true,
    travelBaseCpp: 1.0,
    pointsBoostMaxCpp: 1.5,
    legacyCpp: 1.25,
    ratioOverrides: HYATT_4_3,
    notes: [
      'Chase Travel: 1¢/pt unless a booking shows Points Boost (reported up to ~1.5¢ on select bookings; some reports cite higher on select premium cabins).',
      'Cardholders before 2025-06-23: points earned before 2025-10-26 can redeem at 1.25¢ in Chase Travel until 2027-10-26.',
      'World of Hyatt transfers reported at 4:3 (1,000 → 750) from 2026-10-01.',
    ],
  },
  {
    id: 'csr',
    name: 'Chase Sapphire Reserve',
    transferEligible: true,
    travelBaseCpp: 1.0,
    pointsBoostMaxCpp: 2.0,
    legacyCpp: 1.5,
    notes: [
      'Chase Travel: 1¢/pt unless Points Boost applies (reported up to 2¢ on select flights/hotels).',
      'Cardholders before 2025-06-23: points earned before 2025-10-26 can redeem at 1.5¢ in Chase Travel until 2027-10-26.',
      'World of Hyatt reported to remain 1:1 for Sapphire Reserve-branded cards.',
    ],
  },
  {
    id: 'csr-business',
    name: 'Chase Sapphire Reserve for Business',
    transferEligible: true,
    travelBaseCpp: 1.0,
    pointsBoostMaxCpp: 2.0,
    legacyCpp: null,
    notes: ['Chase Travel: 1¢/pt unless Points Boost applies (reported up to 2¢).', 'World of Hyatt reported 1:1.'],
  },
  {
    id: 'ink-preferred',
    name: 'Chase Ink Business Preferred',
    transferEligible: true,
    travelBaseCpp: 1.0,
    pointsBoostMaxCpp: 1.5,
    legacyCpp: 1.25,
    ratioOverrides: HYATT_4_3,
    notes: [
      'Chase Travel: 1¢/pt unless Points Boost applies.',
      'World of Hyatt transfers reported at 4:3 from 2026-10-01.',
    ],
  },
  {
    id: 'cfu',
    name: 'Chase Freedom Unlimited',
    transferEligible: false,
    travelBaseCpp: 1.0,
    pointsBoostMaxCpp: null,
    legacyCpp: null,
    notes: [
      'Cannot transfer to partners on its own. Points can be combined into a Sapphire or Ink Preferred account (if you have one) to unlock transfers.',
    ],
  },
  {
    id: 'cff',
    name: 'Chase Freedom Flex',
    transferEligible: false,
    travelBaseCpp: 1.0,
    pointsBoostMaxCpp: null,
    legacyCpp: null,
    notes: ['Cannot transfer on its own; combine points into a transfer-eligible card account.'],
  },
  {
    id: 'ink-cash',
    name: 'Chase Ink Business Cash',
    transferEligible: false,
    travelBaseCpp: 1.0,
    pointsBoostMaxCpp: null,
    legacyCpp: null,
    notes: ['Cannot transfer on its own; combine points into a transfer-eligible card account.'],
  },
  {
    id: 'ink-unlimited',
    name: 'Chase Ink Business Unlimited',
    transferEligible: false,
    travelBaseCpp: 1.0,
    pointsBoostMaxCpp: null,
    legacyCpp: null,
    notes: ['Cannot transfer on its own; combine points into a transfer-eligible card account.'],
  },
];

export const CARD_SOURCES = [
  'https://www.nerdwallet.com/article/credit-cards/chase-sapphire-preferred-rolls-out-points-boost-hikes-bonus',
  'https://thepointsguy.com/credit-cards/chase-points-boost',
  'https://awardwallet.com/mile-transfer-times?program=Chase',
];

export function getCard(id: CardId): ChaseCard {
  return CARDS.find((c) => c.id === id) ?? CARDS[0];
}
