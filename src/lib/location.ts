import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { LatLng } from '@/domain/config';

export interface UserLocation {
  status: 'idle' | 'asking' | 'active' | 'denied' | 'unavailable';
  position: LatLng | null;
  accuracyM: number | null;
  start: () => void;
  stop: () => void;
}

/**
 * GPS en el CELULAR (expo-location). Pide permiso al tocar "Usar mi ubicación"
 * y sigue la posición mientras la pantalla está abierta. (En el navegador se
 * usa location.web.ts.)
 */
export function useUserLocation(): UserLocation {
  const [status, setStatus] = useState<UserLocation['status']>('idle');
  const [position, setPosition] = useState<LatLng | null>(null);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const sub = useRef<Location.LocationSubscription | null>(null);

  const stop = useCallback(() => {
    sub.current?.remove();
    sub.current = null;
    setStatus('idle');
  }, []);

  const start = useCallback(() => {
    setStatus('asking');
    void (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== 'granted') {
          setStatus('denied');
          return;
        }
        sub.current?.remove();
        sub.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 5, timeInterval: 3000 },
          (loc) => {
            setPosition({ lat: loc.coords.latitude, lng: loc.coords.longitude });
            setAccuracyM(loc.coords.accuracy ?? null);
            setStatus('active');
          },
        );
      } catch {
        setStatus('unavailable');
      }
    })();
  }, []);

  useEffect(() => () => sub.current?.remove(), []);
  return { status, position, accuracyM, start, stop };
}
