import type { Cabin } from './types';

/**
 * Search-link builders. These OPEN a search; they never confirm price or availability.
 * `prefilled: true` means we pass airports/dates in the URL (best effort — sites change
 * their URL formats; if a page ignores them, re-enter the details there).
 */
export interface SearchLink {
  id: string;
  label: string;
  url: string;
  kind: 'cash' | 'award' | 'portal' | 'hotel-cash' | 'hotel-award';
  prefilled: boolean;
  note?: string;
}

export interface FlightQuery {
  origin: string; // may be comma separated for Kayak
  dest: string;
  depart: string;
  ret?: string;
  travelers: number;
  cabin: Cabin;
}

const enc = encodeURIComponent;
const cabinWord: Record<Cabin, string> = { economy: '', premium: 'premium economy', business: 'business class', first: 'first class' };
const kayakCabin: Record<Cabin, string> = { economy: '', premium: '/premium', business: '/business', first: '/first' };

export function flightLinks(q: FlightQuery, opts: { flexible?: boolean } = {}): SearchLink[] {
  const o = q.origin.split(',')[0];
  const rt = !!q.ret;
  const gq = `Flights from ${o} to ${q.dest} on ${q.depart}${rt ? ` through ${q.ret}` : ' one way'}${cabinWord[q.cabin] ? ' ' + cabinWord[q.cabin] : ''}`;
  const kDate = opts.flexible ? `${q.depart}-flexible-3days` : q.depart;
  const kRet = rt ? `/${opts.flexible ? `${q.ret}-flexible-3days` : q.ret}` : '';
  return [
    { id: 'google-flights', label: 'Google Flights', kind: 'cash', prefilled: true, url: `https://www.google.com/travel/flights?q=${enc(gq)}`, note: 'Cash fares; use the date grid / price graph for flexible dates.' },
    {
      id: 'kayak', label: opts.flexible ? 'Kayak (±3 days)' : 'Kayak', kind: 'cash', prefilled: true,
      url: `https://www.kayak.com/flights/${q.origin.replace(/\s/g, '')}-${q.dest}/${kDate}${kRet}${kayakCabin[q.cabin]}/${q.travelers}adults?sort=bestflight_a`,
      note: 'Supports multiple origin airports.',
    },
    {
      id: 'united', label: 'United MileagePlus awards', kind: 'award', prefilled: true,
      url: `https://www.united.com/en/us/fsr/choose-flights?f=${o}&t=${q.dest}&d=${q.depart}${rt ? `&r=${q.ret}` : ''}&tt=${rt ? 2 : 1}&px=${q.travelers}&taxng=1&clm=7&st=bestmatches&at=1`,
      note: 'United + Star Alliance saver space. Chase → United 1:1.',
    },
    {
      id: 'aeroplan', label: 'Air Canada Aeroplan awards', kind: 'award', prefilled: true,
      url: rt
        ? `https://www.aircanada.com/aeroplan/redeem/availability/outbound?org0=${o}&dest0=${q.dest}&departureDate0=${q.depart}&org1=${q.dest}&dest1=${o}&departureDate1=${q.ret}&ADT=${q.travelers}&YTH=0&CHD=0&INF=0&INS=0&lang=en-CA&tripTypeCode=R&marketCode=INT`
        : `https://www.aircanada.com/aeroplan/redeem/availability/outbound?org0=${o}&dest0=${q.dest}&departureDate0=${q.depart}&ADT=${q.travelers}&YTH=0&CHD=0&INF=0&INS=0&lang=en-CA&tripTypeCode=O&marketCode=INT`,
      note: 'Star Alliance partners on a distance-based chart. Requires Aeroplan login.',
    },
    {
      id: 'southwest', label: 'Southwest (points fares)', kind: 'award', prefilled: true,
      url: `https://www.southwest.com/air/booking/select.html?originationAirportCode=${o}&destinationAirportCode=${q.dest}&returnAirportCode=&departureDate=${q.depart}&departureTimeOfDay=ALL_DAY&returnDate=${q.ret ?? ''}&returnTimeOfDay=ALL_DAY&adultPassengersCount=${q.travelers}&fareType=POINTS&tripType=${rt ? 'roundtrip' : 'oneway'}`,
      note: 'Only where Southwest flies (US, Hawaii, Mexico, Caribbean, Central America).',
    },
    {
      id: 'jetblue', label: 'JetBlue (TrueBlue points)', kind: 'award', prefilled: true,
      url: `https://www.jetblue.com/booking/flights?from=${o}&to=${q.dest}&depart=${q.depart}${rt ? `&return=${q.ret}` : ''}&isMultiCity=false&noOfRoute=1&adults=${q.travelers}&children=0&infants=0&sharedMarket=false&roundTripFaresFlag=false&usePoints=true`,
    },
    { id: 'flying-blue', label: 'Air France/KLM Flying Blue', kind: 'award', prefilled: false, url: 'https://wwws.airfrance.us/', note: 'Opens the site; choose "Book with Miles" and enter details.' },
    { id: 'british-airways', label: 'British Airways Avios', kind: 'award', prefilled: false, url: 'https://www.britishairways.com/travel/redeem/execclub/', note: 'oneworld partners (American, Alaska, JAL). Opens the redemption page.' },
    { id: 'iberia', label: 'Iberia Avios', kind: 'award', prefilled: false, url: 'https://www.iberia.com/us/', note: 'Opens the site; select "Pay with Avios".' },
    { id: 'virgin-atlantic', label: 'Virgin Atlantic Flying Club', kind: 'award', prefilled: false, url: 'https://www.virginatlantic.com/', note: 'Delta, Air France/KLM and ANA partner awards.' },
    { id: 'singapore', label: 'Singapore KrisFlyer', kind: 'award', prefilled: false, url: 'https://www.singaporeair.com/en_UK/us/home', note: 'Choose "Redeem flights".' },
    { id: 'chase-travel', label: 'Chase Travel (sign-in required)', kind: 'portal', prefilled: false, url: 'https://www.chase.com/personal/travel', note: 'Shows Points Boost offers for your card. Requires your Chase login.' },
  ];
}

export function hotelLinks(city: string, checkIn?: string, checkOut?: string, travelers = 1, rooms = 1): SearchLink[] {
  const mdY = (s?: string) => (s ? `${s.slice(5, 7)}/${s.slice(8, 10)}/${s.slice(0, 4)}` : '');
  return [
    { id: 'google-hotels', label: 'Google Hotels', kind: 'hotel-cash', prefilled: true, url: `https://www.google.com/travel/search?q=${enc(`hotels in ${city}`)}`, note: 'Set dates on the page.' },
    {
      id: 'hyatt', label: 'World of Hyatt (points)', kind: 'hotel-award', prefilled: !!checkIn,
      url: `https://www.hyatt.com/search/hotels/en-US/${enc(city)}${checkIn ? `?checkinDate=${checkIn}&checkoutDate=${checkOut}&rooms=${rooms}&adults=${travelers}&kids=0&rate=Standard&rateFilter=woh` : ''}`,
    },
    {
      id: 'marriott', label: 'Marriott Bonvoy (points)', kind: 'hotel-award', prefilled: !!checkIn,
      url: `https://www.marriott.com/search/findHotels.mi?destinationAddress.destination=${enc(city)}${checkIn ? `&fromDate=${enc(mdY(checkIn))}&toDate=${enc(mdY(checkOut))}` : ''}&useRewardsPoints=true`,
    },
    { id: 'ihg', label: 'IHG One Rewards', kind: 'hotel-award', prefilled: false, url: 'https://www.ihg.com/hotels/us/en/reservation', note: 'Opens IHG search; tick "Reward Nights".' },
    { id: 'wyndham', label: 'Wyndham Rewards', kind: 'hotel-award', prefilled: false, url: 'https://www.wyndhamhotels.com/', note: 'Opens Wyndham search; choose "Redeem points".' },
  ];
}

export function directionsLink(points: { lat: number; lon: number }[], mode: 'walking' | 'driving' | 'transit' | 'bicycling'): string | null {
  if (points.length < 2) return null;
  const f = (p: { lat: number; lon: number }) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
  const origin = f(points[0]);
  const dest = f(points[points.length - 1]);
  const way = points.slice(1, -1).slice(0, 9).map(f).join('|');
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}${way ? `&waypoints=${enc(way)}` : ''}&travelmode=${mode}`;
}

export function osmDirectionsLink(a: { lat: number; lon: number }, b: { lat: number; lon: number }, mode: 'foot' | 'car' | 'bike'): string {
  const engine = mode === 'foot' ? 'fossgis_osrm_foot' : mode === 'bike' ? 'fossgis_osrm_bike' : 'fossgis_osrm_car';
  return `https://www.openstreetmap.org/directions?engine=${engine}&route=${a.lat.toFixed(5)}%2C${a.lon.toFixed(5)}%3B${b.lat.toFixed(5)}%2C${b.lon.toFixed(5)}`;
}

export function advisoryLink(slug?: string): string {
  return slug
    ? `https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories/${slug}-travel-advisory.html`
    : 'https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories.html/';
}
