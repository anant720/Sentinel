import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import GlobeGL from 'react-globe.gl';

export interface GeoEvent {
  id: string;
  lat: number;
  lon: number;
  isThreat: boolean;
  timestamp: number;
}

interface GlobeProps {
  events: GeoEvent[];
}

const SERVER_LAT = 1.3521;
const SERVER_LON = 103.8198;
const POINT_LIFESPAN = 300_000; // 5 min — keeps historical/seeded dots visible
const ARC_LIFESPAN   = 5_000;  // 5 s arc fade for live events

// Texture served from our own public folder (no CDN dependency)
const GLOBE_IMAGE_URL = '/earth-dark.jpg';
const GLOBE_BUMP_URL  = '/earth-topology.png';

export function Globe({ events }: GlobeProps) {
  const globeRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 800, h: 500 });
  const [tick, setTick] = useState(0); // drives arc/point re-renders

  // ResizeObserver keeps globe sized correctly at all times
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDims({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    // seed immediately
    if (el.clientWidth > 0) setDims({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Enable auto-rotation once globe is ready
  const onGlobeReady = useCallback(() => {
    if (globeRef.current) {
      const ctrl = globeRef.current.controls();
      ctrl.autoRotate      = true;
      ctrl.autoRotateSpeed = 0.4;
      ctrl.enableZoom      = false;
      globeRef.current.pointOfView({ altitude: 2.5 }, 1000);
    }
  }, []);

  // Tick every 200 ms so fade animations update smoothly
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 200);
    return () => clearInterval(id);
  }, []);

  // ── Points ───────────────────────────────────────────────────────────────
  const points = useMemo(() => {
    const now = Date.now();
    const live = events.filter(e => now - e.timestamp < POINT_LIFESPAN);
    return [
      // Always-on server beacon
      { lat: SERVER_LAT, lng: SERVER_LON, color: '#60a5fa', radius: 0.55, label: 'Sentinel Server · Singapore' },
      ...live.map(e => {
        const age = now - e.timestamp;
        const opacity = Math.max(0.15, 1 - age / POINT_LIFESPAN);
        const base = e.isThreat ? `239,68,68` : `34,197,94`;
        return { lat: e.lat, lng: e.lon, color: `rgba(${base},${opacity})`, radius: 0.35 };
      }),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, tick]);

  // ── Arcs ─────────────────────────────────────────────────────────────────
  const arcs = useMemo(() => {
    const now = Date.now();
    return events
      .filter(e => now - e.timestamp < ARC_LIFESPAN)
      .map(e => {
        const age = now - e.timestamp;
        const opacity = Math.max(0, 1 - age / ARC_LIFESPAN);
        const [r, g, b] = e.isThreat ? [239, 68, 68] : [34, 197, 94];
        return {
          startLat: e.lat, startLng: e.lon,
          endLat: SERVER_LAT, endLng: SERVER_LON,
          color: [`rgba(${r},${g},${b},${opacity})`, `rgba(${r},${g},${b},0)`],
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, tick]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', overflow: 'hidden', cursor: 'grab' }}
    >
      <GlobeGL
        ref={globeRef}
        width={dims.w}
        height={dims.h}
        // Textures served from /public
        globeImageUrl={GLOBE_IMAGE_URL}
        bumpImageUrl={GLOBE_BUMP_URL}
        backgroundColor="rgba(0,0,0,0)"
        atmosphereColor="rgba(59,130,246,0.5)"
        atmosphereAltitude={0.18}
        onGlobeReady={onGlobeReady}
        // Points
        pointsData={points}
        pointColor={(d: any) => d.color}
        pointRadius={(d: any) => d.radius}
        pointAltitude={0.01}
        pointLabel={(d: any) => d.label ?? ''}
        // Arcs
        arcsData={arcs}
        arcColor={(d: any) => d.color}
        arcAltitude={0.25}
        arcStroke={0.45}
        arcDashLength={0.5}
        arcDashGap={0.2}
        arcDashAnimateTime={1500}
      />
    </div>
  );
}
