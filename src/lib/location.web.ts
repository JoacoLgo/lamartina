import { useCallback, useEffect, useRef, useState } from 'react';

import type { LatLng } from '@/domain/config';
import type { UserLocation } from './location';

/**
 * GPS en el NAVEGADOR (navigator.geolocation). El navegador pide permiso al
 * usuario. Solo funciona en páginas seguras (https) o en localhost.
 */
export function useUserLocation(): UserLocation {
  const [status, setStatus] = useState<UserLocation['status']>('idle');
  const [position, setPosition] = useState<LatLng | null>(null);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const watchId = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setStatus('idle');
  }, []);

  const start = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      return;
    }
    setStatus('asking');
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setAccuracyM(pos.coords.accuracy ?? null);
        setStatus('active');
      },
      (err) => setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
  }, []);

  useEffect(
    () => () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    },
    [],
  );
  return { status, position, accuracyM, start, stop };
}
