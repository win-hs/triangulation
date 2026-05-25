// magnetic.js — WMM magnetic declination wrapper (geomag.js)

'use strict';

/**
 * Get magnetic declination (degrees) for a given position and date.
 * Uses the global `geoMag` function provided by geomag.js CDN.
 * @param {number} lat
 * @param {number} lon
 * @param {string} dateStr  ISO date string, e.g. "2026-05-25"
 * @returns {number} declination in degrees (positive = east of true north)
 */
function getMagneticDeclination(lat, lon, dateStr) {
  const date = new Date(dateStr);
  const result = geoMag(lat, lon, 0, date);
  return result.dec;
}

/**
 * Convert magnetic azimuth to true azimuth for a single station.
 * @param {number} magneticAzimuth  degrees
 * @param {number} lat
 * @param {number} lon
 * @param {string} dateStr
 * @returns {number} true azimuth in degrees
 */
function magneticToTrue(magneticAzimuth, lat, lon, dateStr) {
  const decl = getMagneticDeclination(lat, lon, dateStr);
  return (magneticAzimuth + decl + 360) % 360;
}

/**
 * Apply magnetic→true correction to an array of stations.
 * Mutates a copy; original stations untouched.
 * @param {Array<{id, lat, lon, azimuth}>} stations  azimuth is magnetic north
 * @param {string} dateStr
 * @returns {Array<{id, lat, lon, azimuth}>}  azimuth corrected to true north
 */
function applyMagneticCorrection(stations, dateStr) {
  return stations.map(s => ({
    ...s,
    azimuth: magneticToTrue(s.azimuth, s.lat, s.lon, dateStr),
  }));
}
