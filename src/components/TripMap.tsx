import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { Place } from '../lib/types';
import { catMeta } from '../lib/places';

/**
 * Leaflet + OpenStreetMap standard tiles (free; usage policy requires attribution and
 * modest traffic — fine for personal use). Viewed tiles are cached by the service worker.
 */
function icon(color: string, label: string, size = 26) {
  return L.divIcon({
    className: '',
    html: `<div class="pp-marker" style="background:${color};width:${size}px;height:${size}px">${label}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

function FitBounds({ points, center, fitKey }: { points: [number, number][]; center: [number, number]; fitKey: string }) {
  const map = useMap();
  useEffect(() => {
    if (points.length >= 2) map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16 });
    else if (points.length === 1) map.setView(points[0], 15);
    else map.setView(center, 12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);
  return null;
}

function Focus({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.setView(target, Math.max(map.getZoom(), 16));
  }, [target, map]);
  return null;
}

function ClickCapture({ onClick }: { onClick?: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => onClick?.(e.latlng.lat, e.latlng.lng) });
  return null;
}

export interface DayStop {
  place: Place;
  n: number;
}

export function TripMap({
  center,
  places,
  dayStops,
  route,
  onMapClick,
  focus,
  pending,
  className = 'h-[420px]',
}: {
  center: [number, number];
  places: Place[];
  dayStops?: DayStop[];
  route?: [number, number][] | null;
  onMapClick?: (lat: number, lon: number) => void;
  focus?: [number, number] | null;
  pending?: [number, number] | null;
  className?: string;
}) {
  const dayIds = new Set(dayStops?.map((s) => s.place.id));
  const pts = useMemo<[number, number][]>(
    () => (dayStops?.length ? dayStops.map((s) => [s.place.lat, s.place.lon]) : places.map((p) => [p.lat, p.lon])),
    [dayStops, places],
  );
  const fitKey = `${center.join()}|${dayStops?.map((s) => s.place.id).join() ?? ''}|${places.length}`;
  return (
    <div className={className}>
      <MapContainer center={center} zoom={12} className="h-full w-full" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <FitBounds points={pts} center={center} fitKey={fitKey} />
        <Focus target={focus ?? null} />
        <ClickCapture onClick={onMapClick} />
        {places
          .filter((p) => !dayIds.has(p.id))
          .map((p) => (
            <Marker key={p.id} position={[p.lat, p.lon]} icon={icon(catMeta(p.category).color, p.favorite ? '★' : '', dayStops?.length ? 14 : 18)} opacity={dayStops?.length ? 0.6 : 1}>
              <Popup>
                <b>{p.name}</b>
                <br />
                <span style={{ textTransform: 'capitalize' }}>{p.category}</span>
                {p.address && (
                  <>
                    <br />
                    <small>{p.address}</small>
                  </>
                )}
              </Popup>
            </Marker>
          ))}
        {dayStops?.map((s) => (
          <Marker key={s.place.id} position={[s.place.lat, s.place.lon]} icon={icon(catMeta(s.place.category).color, String(s.n), 28)} zIndexOffset={1000}>
            <Popup>
              <b>
                {s.n}. {s.place.name}
              </b>
            </Popup>
          </Marker>
        ))}
        {route && route.length > 1 && <Polyline positions={route} pathOptions={{ color: '#0f766e', weight: 4, opacity: 0.8 }} />}
        {pending && <Marker position={pending} icon={icon('#f59e0b', '+', 26)} />}
      </MapContainer>
    </div>
  );
}
