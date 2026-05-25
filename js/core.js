// 無線電追蹤三角定位工具 — core.js — pure triangulation math, no DOM, no side effects

'use strict';

/**
 * Convert degrees to radians.
 */
function toRad(deg) {
  return deg * Math.PI / 180;
}

/**
 * Convert radians to degrees.
 */
function toDeg(rad) {
  return rad * 180 / Math.PI;
}

/**
 * Compute the acute angle (0–90°) between two azimuths.
 */
function acuteAngleBetween(az1, az2) {
  let diff = Math.abs(az1 - az2) % 180;
  if (diff > 90) diff = 180 - diff;
  return diff;
}

/**
 * Planar line intersection from (lat1,lon1) at azimuth az1
 * and (lat2,lon2) at azimuth az2.
 * Returns {lat, lon} or throws if parallel or intersection on back-ray.
 */
function planarIntersect(s1, s2) {
  // Direction vectors from azimuth (north = +y, east = +x)
  const dx1 = Math.sin(toRad(s1.azimuth));
  const dy1 = Math.cos(toRad(s1.azimuth));
  const dx2 = Math.sin(toRad(s2.azimuth));
  const dy2 = Math.cos(toRad(s2.azimuth));

  // Solve s1.pos + t*d1 = s2.pos + u*d2
  // t*dx1 - u*dx2 = s2.lon - s1.lon
  // t*dy1 - u*dy2 = s2.lat - s1.lat
  const dlon = s2.lon - s1.lon;
  const dlat = s2.lat - s1.lat;

  const denom = dx1 * (-dy2) - (-dx2) * dy1;
  if (Math.abs(denom) < 1e-12) {
    throw new Error(`觀測站 #${s1.id} 與 #${s2.id} 的方位線近乎平行，無法定位`);
  }

  const t = (dlon * (-dy2) - (-dx2) * dlat) / denom;
  const u = (dx1 * dlat - dlon * dy1) / denom;

  if (t < 0 || u < 0) {
    throw new Error(`觀測站 #${s1.id} 與 #${s2.id} 的方位線無有效交會，請檢查角度`);
  }

  return {
    lat: s1.lat + t * dy1,
    lon: s1.lon + t * dx1,
  };
}

/**
 * Geodesic intersection using spherical great-circle algebra.
 * The intersection of two great circles = cross product of their normal vectors.
 */
function geodesicIntersect(s1, s2) {
  function toVec(lat, lon) {
    const φ = toRad(lat), λ = toRad(lon);
    return [Math.cos(φ)*Math.cos(λ), Math.cos(φ)*Math.sin(λ), Math.sin(φ)];
  }
  function cross(a, b) {
    return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  }
  function norm(v) {
    const m = Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]);
    return v.map(x => x/m);
  }
  function geodesicBearing(φ1, λ1, φ2, λ2) {
    const Δλ = λ2 - λ1;
    const y = Math.sin(Δλ)*Math.cos(φ2);
    const x = Math.cos(φ1)*Math.sin(φ2) - Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }
  function angDiff(a, b) {
    return Math.abs(((a - b + 540) % 360) - 180);
  }

  // A second point on each great circle, 0.05 rad (~300 km) ahead
  const STEP = 0.05;
  function destPoint(lat, lon, az) {
    const φ1 = toRad(lat), λ1 = toRad(lon), θ = toRad(az);
    const φ2 = Math.asin(Math.sin(φ1)*Math.cos(STEP) + Math.cos(φ1)*Math.sin(STEP)*Math.cos(θ));
    const λ2 = λ1 + Math.atan2(Math.sin(θ)*Math.sin(STEP)*Math.cos(φ1), Math.cos(STEP)-Math.sin(φ1)*Math.sin(φ2));
    return [φ2, λ2]; // radians
  }

  const [φ1b, λ1b] = destPoint(s1.lat, s1.lon, s1.azimuth);
  const [φ2b, λ2b] = destPoint(s2.lat, s2.lon, s2.azimuth);

  const n1 = norm(cross(toVec(s1.lat, s1.lon), [Math.cos(φ1b)*Math.cos(λ1b), Math.cos(φ1b)*Math.sin(λ1b), Math.sin(φ1b)]));
  const n2 = norm(cross(toVec(s2.lat, s2.lon), [Math.cos(φ2b)*Math.cos(λ2b), Math.cos(φ2b)*Math.sin(λ2b), Math.sin(φ2b)]));

  // Two antipodal intersection candidates
  const i = norm(cross(n1, n2));
  const candidates = [i, i.map(x => -x)];

  const φ1r = toRad(s1.lat), λ1r = toRad(s1.lon);
  const φ2r = toRad(s2.lat), λ2r = toRad(s2.lon);

  for (const c of candidates) {
    const lat = toDeg(Math.asin(Math.max(-1, Math.min(1, c[2]))));
    const lon = toDeg(Math.atan2(c[1], c[0]));
    const φ = toRad(lat), λ = toRad(lon);
    const b1 = geodesicBearing(φ1r, λ1r, φ, λ);
    const b2 = geodesicBearing(φ2r, λ2r, φ, λ);
    if (angDiff(b1, s1.azimuth) < 90 && angDiff(b2, s2.azimuth) < 90) {
      return { lat, lon };
    }
  }

  throw new Error(`觀測站 #${s1.id} 與 #${s2.id} 的方位線無有效交會，請檢查角度`);
}

/**
 * Estimate line length for drawing: max inter-station distance * 3.
 */
function computeLineLength(stations) {
  let maxDist = 0;
  for (let i = 0; i < stations.length; i++) {
    for (let j = i + 1; j < stations.length; j++) {
      const dlat = stations[i].lat - stations[j].lat;
      const dlon = stations[i].lon - stations[j].lon;
      // Approximate km
      const dist = Math.sqrt(dlat * dlat + dlon * dlon) * 111;
      if (dist > maxDist) maxDist = dist;
    }
  }
  return Math.max(maxDist * 3, 50); // min 50 km so lines are visible
}

/**
 * Centroid estimator: average of all pairwise intersections.
 */
function centroidEstimate(intersections) {
  const n = intersections.length;
  const lat = intersections.reduce((s, p) => s + p.lat, 0) / n;
  const lon = intersections.reduce((s, p) => s + p.lon, 0) / n;
  return { lat, lon };
}

/**
 * MLE estimator (Lenth 1981) — iterative reweighted least squares.
 * Initial guess from centroid.
 */
function mleEstimate(stations, initial) {
  let lat = initial.lat;
  let lon = initial.lon;

  for (let iter = 0; iter < 50; iter++) {
    let sumW = 0, sumWLat = 0, sumWLon = 0;

    for (const s of stations) {
      const dlat = lat - s.lat;
      const dlon = lon - s.lon;

      // Predicted azimuth from station to current estimate
      const predAz = (toDeg(Math.atan2(dlon, dlat)) + 360) % 360;
      const residual = toRad(((predAz - s.azimuth + 540) % 360) - 180);

      // Weight: 1 / sin²(residual + ε)  — Lenth 1981 approximation
      const dist = Math.sqrt(dlat * dlat + dlon * dlon) * 111000; // metres
      const w = dist > 0 ? 1 / (Math.sin(residual) * Math.sin(residual) + 1e-6) : 1;

      // Foot of perpendicular from current estimate onto the bearing ray
      const sinAz = Math.sin(toRad(s.azimuth));
      const cosAz = Math.cos(toRad(s.azimuth));
      const proj = (dlat * cosAz + dlon * sinAz);
      const footLat = s.lat + proj * cosAz;
      const footLon = s.lon + proj * sinAz;

      sumW += w;
      sumWLat += w * footLat;
      sumWLon += w * footLon;
    }

    const newLat = sumWLat / sumW;
    const newLon = sumWLon / sumW;

    if (Math.abs(newLat - lat) < 1e-5 && Math.abs(newLon - lon) < 1e-5) {
      return { lat: newLat, lon: newLon };
    }
    lat = newLat;
    lon = newLon;
  }

  // Oscillating but stable — return current best estimate
  return { lat, lon };
}

/**
 * Main triangulation function.
 * @param {Array<{id:number, lat:number, lon:number, azimuth:number}>} stations
 * @param {{lineAlgorithm:'planar'|'geodesic', estimator:'mle'|'centroid'}} options
 */
function calculateTarget(stations, options) {
  if (stations.length < 2) {
    throw new Error('至少需要 2 個觀測站');
  }

  const lineLength = computeLineLength(stations);

  // Check for parallel pairs first (acute angle < 0.5°)
  for (let i = 0; i < stations.length; i++) {
    for (let j = i + 1; j < stations.length; j++) {
      const angle = acuteAngleBetween(stations[i].azimuth, stations[j].azimuth);
      if (angle < 0.5) {
        throw new Error(`觀測站 #${stations[i].id} 與 #${stations[j].id} 的方位線近乎平行，無法定位`);
      }
    }
  }

  // Compute all pairwise intersections
  const pairIntersections = [];
  const allPairAngles = [];

  for (let i = 0; i < stations.length; i++) {
    for (let j = i + 1; j < stations.length; j++) {
      const s1 = stations[i];
      const s2 = stations[j];
      const angle = acuteAngleBetween(s1.azimuth, s2.azimuth);
      allPairAngles.push({ stations: [s1.id, s2.id], angle });

      const pt = options.lineAlgorithm === 'geodesic'
        ? geodesicIntersect(s1, s2)
        : planarIntersect(s1, s2);

      pairIntersections.push({ stations: [s1.id, s2.id], lat: pt.lat, lon: pt.lon });
    }
  }

  // Centroid estimate
  const centroid = centroidEstimate(pairIntersections);

  // Final estimate
  const target = options.estimator === 'mle'
    ? mleEstimate(stations, centroid)
    : centroid;

  // Min acute angle
  const minPair = allPairAngles.reduce((m, p) => p.angle < m.angle ? p : m);

  return {
    target,
    minAcuteAngle: { value: minPair.angle, stationPair: minPair.stations },
    allPairAngles,
    pairIntersections,
    lineLength,
  };
}
