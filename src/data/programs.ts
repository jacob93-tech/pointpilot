import type { Region } from '../lib/types';

/**
 * How each Chase AIRLINE transfer partner is used to book flights.
 *
 * Compiled 2026-11-18 from general, long-standing program rules (alliance
 * membership and each program's own-site booking options). Airline alliances and
 * partner lists change — the app labels this as reference data to verify, and it
 * NEVER claims a specific route or seat exists. Which airlines actually fly a route
 * on given dates comes from the user's own search (e.g. Google Flights).
 */

export type PricingModel = 'distance-chart' | 'dynamic' | 'revenue';

export interface ProgramGuide {
  partnerId: string;
  /** What you call the currency on that site */
  currency: string;
  pricing: PricingModel;
  pricingNote: string;
  /** Airlines this program can typically book (own metal + main partners) */
  books: string[];
  /** Regions where this program is a realistic choice from the US */
  regions: Region[] | 'all';
  /** Where to search award seats */
  searchUrl: string;
  /** How to run the search on their site */
  searchHow: string;
  /** Typical cents per program point for revenue-based programs (low, high) */
  typicalCpp?: [number, number];
  /** Caveats shown with the walkthrough */
  tips: string[];
}

const ONEWORLD = ['American Airlines', 'Alaska Airlines', 'British Airways', 'Iberia', 'Japan Airlines', 'Qatar Airways', 'Finnair', 'Cathay Pacific', 'Qantas'];
const STAR = ['United', 'Air Canada', 'Lufthansa', 'Swiss', 'Austrian', 'ANA', 'Singapore Airlines', 'EVA Air', 'Turkish Airlines', 'Copa', 'Avianca', 'TAP Air Portugal', 'Air New Zealand'];
const SKYTEAM = ['Delta', 'Air France', 'KLM', 'Aeromexico', 'Korean Air', 'Virgin Atlantic'];

export const PROGRAM_GUIDES: ProgramGuide[] = [
  {
    partnerId: 'british-airways',
    currency: 'Avios',
    pricing: 'distance-chart',
    pricingNote: 'Partner flights (e.g. American, Alaska) are priced by distance flown per segment, so short nonstops are cheapest and connections cost more.',
    books: ONEWORLD,
    regions: 'all',
    searchUrl: 'https://www.britishairways.com/travel/redeem/execclub/',
    searchHow: 'Sign in, choose "Book with Avios", enter the airports and dates, and look for flights operated by American, Alaska or other oneworld airlines.',
    tips: [
      'Avios on British Airways–operated flights to Europe carry large surcharges; partner flights within the Americas usually have low taxes.',
      'Avios can be moved free between British Airways, Iberia and Aer Lingus accounts — so a bonus on any of the three can help.',
    ],
  },
  {
    partnerId: 'iberia',
    currency: 'Avios',
    pricing: 'distance-chart',
    pricingNote: 'Iberia-operated flights use an Iberia chart with off-peak and peak dates; often lower surcharges than BA to Spain.',
    books: ['Iberia', 'Level', 'some oneworld partners'],
    regions: ['europe', 'south-america'],
    searchUrl: 'https://www.iberia.com/us/',
    searchHow: 'Sign in, pick "Pay with Avios", and search the route.',
    tips: ['Iberia Avios and British Airways Avios can be combined, so you can transfer to whichever has the bonus.'],
  },
  {
    partnerId: 'aer-lingus',
    currency: 'Avios',
    pricing: 'distance-chart',
    pricingNote: 'Aer Lingus–operated flights, priced by distance with off-peak/peak dates.',
    books: ['Aer Lingus'],
    regions: ['europe'],
    searchUrl: 'https://www.aerlingus.com/travel-information/aerclub/',
    searchHow: 'Sign in to AerClub, choose "Book with Avios", and search the route via Dublin.',
    tips: ['Avios can be moved between Aer Lingus and British Airways accounts.'],
  },
  {
    partnerId: 'aeroplan',
    currency: 'Aeroplan points',
    pricing: 'distance-chart',
    pricingNote: 'Flights on partner airlines (United, Lufthansa, ANA…) follow a published distance-based chart; Air Canada flights are priced dynamically.',
    books: STAR,
    regions: 'all',
    searchUrl: 'https://www.aircanada.com/aeroplan/redeem/',
    searchHow: 'Sign in to Aeroplan and search the route; results include United and other Star Alliance flights.',
    tips: ['Aeroplan adds a small partner booking fee on some itineraries.', 'Aeroplan often prices the same United seat lower than United does.'],
  },
  {
    partnerId: 'united',
    currency: 'miles',
    pricing: 'dynamic',
    pricingNote: 'United flights are priced dynamically (prices move with demand); partner saver awards are more stable.',
    books: STAR,
    regions: 'all',
    searchUrl: 'https://www.united.com/en/us/fly/mileageplus.html',
    searchHow: 'Tick "Book with miles" on united.com and search; the calendar view shows the cheapest dates.',
    tips: ['Compare the same United flight on Aeroplan — it is sometimes cheaper there.'],
  },
  {
    partnerId: 'singapore',
    currency: 'KrisFlyer miles',
    pricing: 'distance-chart',
    pricingNote: 'Saver awards on Singapore Airlines and partner awards on Star Alliance airlines use published charts.',
    books: ['Singapore Airlines', ...STAR.filter((a) => a !== 'Singapore Airlines')],
    regions: ['east-asia', 'southeast-asia', 'oceania', 'europe'],
    searchUrl: 'https://www.singaporeair.com/en_UK/us/home',
    searchHow: 'Sign in, choose "Redeem flights", and search the route.',
    tips: ['Transfers to Singapore can take about a day — check space first and expect a delay.'],
  },
  {
    partnerId: 'flying-blue',
    currency: 'Flying Blue miles',
    pricing: 'dynamic',
    pricingNote: 'Dynamic pricing; monthly "Promo Rewards" discount selected routes.',
    books: SKYTEAM,
    regions: 'all',
    searchUrl: 'https://wwws.airfrance.us/',
    searchHow: 'Sign in, choose "Book with Miles", and search the route; results include Delta and other SkyTeam flights.',
    tips: ['Carrier surcharges can apply on some routes — check taxes before booking.'],
  },
  {
    partnerId: 'virgin-atlantic',
    currency: 'Virgin Points',
    pricing: 'dynamic',
    pricingNote: 'Pricing varies by partner; Virgin-operated flights carry surcharges.',
    books: ['Virgin Atlantic', 'Delta', 'Air France', 'KLM', 'ANA', 'other SkyTeam partners'],
    regions: 'all',
    searchUrl: 'https://www.virginatlantic.com/',
    searchHow: 'Sign in, choose "Book with points", and search the route; check Virgin\'s partner list for which airlines are bookable.',
    tips: ['Some partner awards must be booked by phone.'],
  },
  {
    partnerId: 'southwest',
    currency: 'Rapid Rewards points',
    pricing: 'revenue',
    pricingNote: 'Revenue-based: points track the cash fare, so a cheap fare is cheap in points too.',
    books: ['Southwest'],
    regions: ['us-mainland', 'hawaii', 'mexico', 'caribbean', 'central-america'],
    searchUrl: 'https://www.southwest.com/',
    searchHow: 'Choose "Points" instead of "Dollars" when searching.',
    typicalCpp: [1.25, 1.5],
    tips: ['Only useful where Southwest actually flies your route.'],
  },
  {
    partnerId: 'jetblue',
    currency: 'TrueBlue points',
    pricing: 'revenue',
    pricingNote: 'Revenue-based: points track the cash fare.',
    books: ['JetBlue'],
    regions: ['us-mainland', 'mexico', 'caribbean', 'central-america', 'south-america', 'europe'],
    searchUrl: 'https://www.jetblue.com/',
    searchHow: 'Toggle "Use TrueBlue points" when searching.',
    typicalCpp: [1.2, 1.4],
    tips: ['Only useful where JetBlue actually flies your route.'],
  },
  {
    partnerId: 'cathay',
    currency: 'Asia Miles',
    pricing: 'distance-chart',
    pricingNote: 'Distance-based chart on Cathay Pacific and oneworld partners.',
    books: ['Cathay Pacific', ...ONEWORLD.filter((a) => a !== 'Cathay Pacific')],
    regions: ['east-asia', 'southeast-asia', 'oceania'],
    searchUrl: 'https://www.cathaypacific.com/cx/en_US/membership.html',
    searchHow: 'Sign in and choose "Redeem flights".',
    tips: ['Newly reported Chase partner — confirm it appears on your Chase transfer screen first.'],
  },
  {
    partnerId: 'qantas',
    currency: 'Qantas Points',
    pricing: 'distance-chart',
    pricingNote: 'Distance-based chart on Qantas and oneworld partners.',
    books: ['Qantas', ...ONEWORLD.filter((a) => a !== 'Qantas')],
    regions: ['oceania', 'east-asia', 'southeast-asia'],
    searchUrl: 'https://www.qantas.com/us/en/frequent-flyer.html',
    searchHow: 'Sign in and choose "Use points".',
    tips: ['Newly reported Chase partner — confirm it appears on your Chase transfer screen first.'],
  },
];

/** Low-cost airlines with no Chase transfer partner — pay cash or book via Chase Travel. */
export const NO_PARTNER_AIRLINES = ['Volaris', 'VivaAerobus', 'Frontier', 'Spirit', 'Allegiant', 'Breeze', 'Sun Country', 'Avelo'];

export const PROGRAMS_COMPILED = '2026-11-18';

export function guideFor(partnerId: string): ProgramGuide | undefined {
  return PROGRAM_GUIDES.find((g) => g.partnerId === partnerId);
}
