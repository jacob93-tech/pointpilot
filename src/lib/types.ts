// Core typed interfaces shared by data, engine, providers and UI.

/**
 * Where a number came from. Every price/score shown in the UI carries one of these
 * so estimates are never mistaken for live quotes.
 *  - live:      fetched from a live free API in this session (e.g. weather history, FX)
 *  - cached:    previously fetched/verified, shown with its timestamp
 *  - user:      typed in by the user (prices they found, verified bonuses)
 *  - reported:  reported by a third-party source, not yet verified by the user with Chase
 *  - estimate:  heuristic / curated rough range — never a quote
 *  - example:   demonstration data
 */
export type DataQuality = 'live' | 'cached' | 'user' | 'reported' | 'estimate' | 'example';

export type CardId =
  | 'csp'
  | 'csr'
  | 'csr-business'
  | 'ink-preferred'
  | 'cfu'
  | 'cff'
  | 'ink-cash'
  | 'ink-unlimited';

export type Cabin = 'economy' | 'premium' | 'business' | 'first';

export type TripStyle =
  | 'beach'
  | 'food'
  | 'culture'
  | 'adventure'
  | 'nature'
  | 'nightlife'
  | 'city'
  | 'relaxation'
  | 'shopping';

export type Region =
  | 'us-mainland'
  | 'hawaii'
  | 'caribbean'
  | 'mexico'
  | 'canada'
  | 'central-america'
  | 'south-america'
  | 'europe'
  | 'east-asia'
  | 'southeast-asia'
  | 'oceania'
  | 'middle-east'
  | 'africa';

export type Range = [number, number];

export interface Ratio {
  /** Chase points sent */
  chase: number;
  /** Partner points received for that many Chase points (before bonuses) */
  partner: number;
}

export interface ChaseCard {
  id: CardId;
  name: string;
  transferEligible: boolean;
  /** Chase Travel value per point with no Points Boost, in cents */
  travelBaseCpp: number;
  /** Highest Points Boost rate reported for select bookings (cents); null if none */
  pointsBoostMaxCpp: number | null;
  /** Legacy fixed rate for points earned before 2025-10-26, usable until 2027-10-26, if cardholder before 2025-06-23 */
  legacyCpp: number | null;
  /** Per-card ratio overrides for specific partners */
  ratioOverrides?: Record<string, Ratio>;
  notes: string[];
}

export interface TransferPartner {
  id: string;
  name: string;
  program: string;
  type: 'airline' | 'hotel';
  alliance?: 'Star Alliance' | 'SkyTeam' | 'oneworld' | null;
  ratio: Ratio;
  minTransfer: number;
  increment: number;
  transferTime: string;
  bookingUrl: string;
  notes: string;
  /** confirmed: listed by multiple sources; reported-new: very recently reported, single source */
  seedConfidence: 'confirmed' | 'reported-new';
  sourceUrls: string[];
  /** ISO date the seed data was compiled */
  seededAt: string;
  /** ISO date-time the user confirmed this ratio in their own Chase account */
  userVerifiedAt?: string;
  active: boolean;
}

export interface TransferBonus {
  id: string;
  partnerId: string;
  bonusPercent: number;
  startDate?: string;
  endDate?: string;
  eligibility: string;
  targeted: boolean;
  sourceName: string;
  sourceUrl: string;
  /** When this bonus was recorded from its source */
  reportedAt: string;
  /** When the USER confirmed it on Chase's transfer screen */
  verifiedAt?: string;
  notes?: string;
  createdBy: 'seed' | 'user';
}

export type BonusState = 'verified-active' | 'needs-verification' | 'expired' | 'upcoming';

export interface CostProfile {
  /** mid-range hotel, per room-night, USD */
  hotelNight: Range;
  /** per person per day */
  foodDay: Range;
  /** local transport per person per day */
  localDay: Range;
  /** attractions/activities per person per day */
  activityDay: Range;
}

export interface Destination {
  id: string;
  name: string;
  country: string;
  region: Region;
  domestic: boolean;
  airports: string[];
  lat: number;
  lon: number;
  utcOffset: number;
  experience: Partial<Record<TripStyle, number>>;
  costs: CostProfile;
  bestMonths: number[];
  okayMonths: number[];
  /** approximate World of Hyatt category range in the area, if any */
  hyattCategories?: Range;
  hotelPrograms: ('hyatt' | 'marriott' | 'ihg' | 'wyndham')[];
  /** last-known US State Dept level (developer seeded, may be outdated) */
  advisoryLevel: 1 | 2 | 3 | 4 | null;
  advisorySlug?: string;
  wikiTitle: string;
  blurb: string;
}

export interface Airport {
  code: string;
  name: string;
  city: string;
  lat: number;
  lon: number;
}

export interface DepartureAirport {
  code: string;
  /** user's estimated round-trip cost to get to/from this airport (gas, parking, rideshare) */
  groundCost: number;
  /** extra one-way travel time to the airport in hours (for convenience scoring) */
  groundHours: number;
  isHome: boolean;
}

export interface Profile {
  id: 'profile';
  points: number;
  cardId: CardId;
  airports: DepartureAirport[];
  travelers: number;
  cabin: Cabin;
  /** Minimum acceptable redemption value — also used as the opportunity cost of a point */
  minAcceptableCpp: number;
  /** Points Boost rate to model as an optional Chase Travel scenario (cents) */
  pointsBoostCpp: number;
  /** Legacy-rate points (earned before 2025-10-26) still redeemable at the card's legacy rate */
  legacyPoints: number;
  homeCurrency: string;
  styles: TripStyle[];
  /** optional email for Nominatim's usage policy (sent only to Nominatim if filled) */
  nominatimEmail: string;
  bonusVerifyWindowDays: number;
  updatedAt: string;
}

export type DateMode = 'month' | 'range' | 'weekends' | 'specific';

export interface SearchParams {
  points: number;
  cardId: CardId;
  airports: DepartureAirport[];
  month: number; // 1-12
  year: number;
  dateMode: DateMode;
  rangeStart?: string;
  rangeEnd?: string;
  departDates: string[];
  returnDates: string[];
  minDays: number;
  maxDays: number;
  travelers: number;
  cabin: Cabin;
  maxCash: number;
  maxPoints: number;
  scope: 'both' | 'domestic' | 'international';
  preferred: string[];
  excluded: string[];
  maxLayovers: number | null;
  maxFlightHours: number | null;
  styles: TripStyle[];
  priority: PriorityPreset;
  weights: ScoreWeights;
}

export type PriorityPreset =
  | 'balanced'
  | 'points-value'
  | 'min-cash'
  | 'experiences'
  | 'min-travel'
  | 'food-culture'
  | 'outdoors'
  | 'custom';

export interface ScoreWeights {
  pointsValue: number;
  affordability: number;
  convenience: number;
  experiences: number;
  weather: number;
  preference: number;
}

export interface SavedSearch {
  id: string;
  name: string;
  params: SearchParams;
  createdAt: string;
}

export interface SavedDestination {
  id: string; // destination id
  note: string;
  createdAt: string;
}

export type Availability = 'seen-available' | 'not-checked' | 'unavailable';

export interface RedemptionOption {
  id: string;
  method: 'transfer' | 'chase-travel';
  partnerId?: string;
  /** partner miles/points required for ALL travelers */
  partnerPoints?: number;
  /** cash taxes & fees for the award, all travelers */
  taxesFees: number;
  /** Chase Travel: points charged */
  chaseTravelPoints?: number;
  availability: Availability;
  source: string;
  verifiedAt?: string;
  notes?: string;
}

export interface Comparison {
  id: string;
  title: string;
  kind: 'flight' | 'hotel';
  origin?: string;
  destination?: string;
  destinationId?: string;
  tripId?: string;
  departDate?: string;
  returnDate?: string;
  cabin?: Cabin;
  travelers: number;
  /** cash price for a genuinely comparable itinerary, all travelers, taxes INCLUDED */
  cashPrice: number | null;
  cashSource: string;
  cashVerifiedAt?: string;
  cashUrl?: string;
  options: RedemptionOption[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FlexPriceEntry {
  id: string;
  destinationId: string;
  origin: string;
  departDate: string;
  returnDate: string;
  pricePerPerson: number;
  source: string;
  recordedAt: string;
}

export interface Trip {
  id: string;
  name: string;
  destinationId?: string;
  city: string;
  lat: number;
  lon: number;
  startDate: string;
  endDate: string;
  travelers: number;
  cashBudget: number;
  pointsBudget: number;
  currency: string;
  notes: string;
  dayStart: string; // "09:00"
  dayEnd: string; // "21:00"
  travelMode: TravelMode;
  /** optional place (usually the hotel) each day starts from */
  startPlaceId?: string;
  createdAt: string;
  updatedAt: string;
}

export type TravelMode = 'foot' | 'driving' | 'bike';

export type PlaceCategory =
  | 'restaurant'
  | 'cafe'
  | 'attraction'
  | 'nature'
  | 'shopping'
  | 'nightlife'
  | 'hotel'
  | 'transport'
  | 'custom';

export interface Place {
  id: string;
  tripId: string;
  name: string;
  category: PlaceCategory;
  lat: number;
  lon: number;
  address: string;
  source: 'nominatim' | 'photon' | 'manual' | 'gmaps-link';
  osmRef?: string;
  url?: string;
  notes: string;
  favorite: boolean;
  visited: boolean;
  /** optional user-entered opening hours "HH:MM" */
  openTime?: string;
  closeTime?: string;
  durationMin: number;
  createdAt: string;
}

export interface ItineraryItem {
  id: string;
  tripId: string;
  date: string; // ISO date
  placeId?: string;
  title: string;
  order: number;
  durationMin: number;
  locked: boolean;
  fixedStart?: string; // "HH:MM", required when locked
  kind: 'activity' | 'reservation' | 'meal';
  notes?: string;
}

export type ExpenseCategory =
  | 'flights'
  | 'hotels'
  | 'food'
  | 'transportation'
  | 'attractions'
  | 'shopping'
  | 'misc';

export interface Expense {
  id: string;
  tripId: string;
  category: ExpenseCategory;
  description: string;
  kind: 'estimated' | 'actual';
  amount: number;
  currency: string;
  /** USD-equivalent at entry time (or same as amount if USD) */
  amountHome: number;
  fxRate?: number;
  fxDate?: string;
  pointsUsed: number;
  date: string;
  createdAt: string;
}

export interface CacheEntry {
  key: string;
  value: unknown;
  fetchedAt: string;
}
