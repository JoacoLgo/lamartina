import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { VenueConfig } from '../config';
import { distanceToPolylineM, formatDistance, guidance, haversineM, pointInPolygon } from '../geo';

/** 1 grado de latitud ≈ 111.195 m. Con esto armamos puntos a distancias conocidas. */
const M = 1 / 111_195;
const gate = { lat: -38.8857, lng: -62.0292 };
const at = (northM: number, eastM: number) => ({
  lat: gate.lat + northM * M,
  lng: gate.lng + (eastM * M) / Math.cos((gate.lat * Math.PI) / 180),
});

const venue: VenueConfig = {
  name: 'La Martina',
  sport: 'Footgolf',
  tagline: '',
  address: '',
  mapsQuery: '',
  gate,
  gateLabel: 'Tranquera',
  // camino de 1 km hacia el norte, con el predio al final
  route: [gate, at(500, 0), at(1000, 0)],
  predio: [at(1000, -100), at(1000, 100), at(1300, 100), at(1300, -100)],
  hours: '',
  phone: '',
  whatsapp: '',
  arrival: [],
  firstVisit: [],
};

describe('geometría', () => {
  it('haversine: 1000 m al norte son ~1000 m', () => {
    assert.ok(Math.abs(haversineM(gate, at(1000, 0)) - 1000) < 5);
  });

  it('punto dentro y fuera de un polígono', () => {
    assert.equal(pointInPolygon(at(1100, 0), venue.predio), true);
    assert.equal(pointInPolygon(at(500, 0), venue.predio), false);
    assert.equal(pointInPolygon(at(0, 0), []), false);
  });

  it('distancia a la línea del camino', () => {
    assert.ok(Math.abs(distanceToPolylineM(at(250, 30), venue.route) - 30) < 2);
    assert.ok(distanceToPolylineM(at(500, 0), venue.route) < 1);
    assert.equal(distanceToPolylineM(gate, []), Infinity);
  });

  it('formatea distancias', () => {
    assert.equal(formatDistance(850), '850 m');
    assert.equal(formatDistance(2340), '2,3 km');
  });
});

describe('guía de camino', () => {
  it('lejos: manda a usar Google Maps hasta la tranquera', () => {
    const g = guidance(at(-20_000, 0), venue);
    assert.equal(g.state, 'far');
    assert.match(g.message, /Google Maps/);
  });

  it('cerca de la tranquera pero sobre la ruta', () => {
    assert.equal(guidance(at(-600, 0), venue).state, 'nearGate');
  });

  it('en la tranquera', () => {
    assert.equal(guidance(at(10, 5), venue).state, 'atGate');
  });

  it('sobre el camino correcto', () => {
    const g = guidance(at(400, 10), venue);
    assert.equal(g.state, 'onRoute');
    assert.match(g.message, /camino correcto/);
  });

  it('se salió del camino', () => {
    const g = guidance(at(400, 120), venue);
    assert.equal(g.state, 'offRoute');
    assert.match(g.message, /Volvé/);
  });

  it('llegó al predio', () => {
    assert.equal(guidance(at(1100, 0), venue).state, 'arrived');
  });

  it('sin tranquera cargada', () => {
    assert.equal(guidance(gate, { ...venue, gate: null }).state, 'noGate');
  });

  it('sin camino dibujado igual orienta hacia la tranquera', () => {
    const noRoute = { ...venue, route: [], predio: [] };
    assert.equal(guidance(at(-300, 0), noRoute).state, 'nearGate');
    assert.equal(guidance(at(5, 0), noRoute).state, 'atGate');
  });
});
