// geomag.js — self-contained WMM2025 magnetic declination calculator
// Adapted from the geomagnetism npm package (MIT licence)
// Exposes: geoMag(lat, lon, altKm, date) → {dec: degrees}

(function (global) {
  'use strict';

  // ── WMM2025 coefficients ──────────────────────────────────────────────
  var WMM2025 = {"main_field_coeff_g":[0,-29351.8,-1410.8,-2556.6,2951.1,1649.3,1361,-2404.1,1243.8,453.6,895,799.5,55.7,-281.1,12.1,-233.2,368.9,187.2,-138.7,-142,20.9,64.4,63.8,76.9,-115.7,-40.9,14.9,-60.7,79.5,-77,-8.8,59.3,15.8,2.5,-11.1,14.2,23.2,10.8,-17.5,2,-21.7,16.9,15,-16.8,0.9,4.6,7.8,3,-0.2,-2.5,-13.1,2.4,8.6,-8.7,-12.9,-1.3,-6.4,0.2,2,-1,-0.6,-0.9,1.5,0.9,-2.7,-3.9,2.9,-1.5,-2.5,2.4,-0.6,-0.1,-0.6,-0.1,1.1,-1,-0.2,2.6,-2,-0.2,0.3,1.2,-1.3,0.6,0.6,0.5,-0.1,-0.4,-0.2,-1.3,-0.7],"main_field_coeff_h":[0,0,4545.4,0,-3133.6,-815.1,0,-56.6,237.5,-549.5,0,278.6,-133.9,212,-375.6,0,45.4,220.2,-122.9,43,106.1,0,-18.4,16.8,48.8,-59.8,10.9,72.7,0,-48.9,-14.4,-1,23.4,-7.4,-25.1,-2.3,0,7.1,-12.6,11.4,-9.7,12.7,0.7,-5.2,3.9,0,-24.8,12.2,8.3,-3.3,-5.2,7.2,-0.6,0.8,10,0,3.3,0,2.4,5.3,-9.1,0.4,-4.2,-3.8,0.9,-9.1,0,0,2.9,-0.6,0.2,0.5,-0.3,-1.2,-1.7,-2.9,-1.8,-2.3,0,-1.3,0.7,1,-1.4,0,0.6,-0.1,0.8,0.1,-1,0.1,0.2],"secular_var_coeff_g":[0,12,9.7,-11.6,-5.2,-8,-1.3,-4.2,0.4,-15.6,-1.6,-2.4,-6,5.6,-7,0.6,1.4,0,0.6,2.2,0.9,-0.2,-0.4,0.9,1.2,-0.9,0.3,0.9,0,-0.1,-0.1,0.5,-0.1,-0.8,-0.8,0.8,-0.1,0.2,0,0.5,-0.1,0.3,0.2,0,0.2,0,-0.1,0.1,0.3,-0.3,0,0.3,-0.1,0.1,-0.1,0.1,0,0.1,0.1,0,-0.3,0,-0.1,-0.1,0,0,0,0,0,0,0,-0.1,0,0,-0.1,-0.1,-0.1,-0.1,0,0,0,0,0,0,0.1,0,0,0,-0.1,0,-0.1],"secular_var_coeff_h":[0,0,-21.5,0,-27.7,-12.1,0,4,-0.3,-4.1,0,-1.1,4.1,1.6,-4.4,0,-0.5,2.2,0.4,1.7,1.9,0,0.3,-1.6,-0.4,0.9,0.7,0.9,0,0.6,0.5,-0.8,0,-1,0.6,-0.2,0,-0.2,0.5,-0.4,0.4,-0.5,-0.6,0.3,0.2,0,-0.3,0.3,-0.3,0.3,0.2,-0.1,-0.2,0.4,0.1,0,0,0,-0.2,0.1,-0.1,0.1,0,-0.1,0.2,0,0,0,0.1,0,0.1,0,0,0.1,0,0,0,0,0,0,0,-0.1,0.1,0,0,0,0,0,0,0,-0.1],"n_max":12,"n_max_sec_var":12,"epoch":2025,"name":"WMM-2025","start_date":"2024-11-13T03:00:00.000Z","end_date":"2029-11-13T03:00:00.000Z"};

  // ── Ellipsoid (WGS84) ─────────────────────────────────────────────────
  var a = 6378.137, b = 6356.7523142, re = 6371.2;
  var epssq = 1 - (b * b) / (a * a);

  // ── Geodetic → Spherical ──────────────────────────────────────────────
  function toSpherical(lat, lon, altKm) {
    var coslat = Math.cos(lat * Math.PI / 180);
    var sinlat = Math.sin(lat * Math.PI / 180);
    var rc = a / Math.sqrt(1 - epssq * sinlat * sinlat);
    var xp = (rc + altKm) * coslat;
    var zp = (rc * (1 - epssq) + altKm) * sinlat;
    var r = Math.sqrt(xp * xp + zp * zp);
    return {
      r: r,
      phig: 180 / Math.PI * Math.asin(zp / r),
      lambda: lon,
    };
  }

  // ── Schmidt quasi-normal Legendre functions ───────────────────────────
  function legendre(phig, n_max) {
    var sin_phi = Math.sin(phig * Math.PI / 180);
    var x = sin_phi;
    var z = Math.sqrt((1 - x) * (1 + x));
    var pcup = [1.0];
    var dpcup = [0.0];
    var schmidt = [1.0];
    var n, m, i, i1, i2, k;

    for (n = 1; n <= n_max; n++) {
      for (m = 0; m <= n; m++) {
        i = n * (n + 1) / 2 + m;
        if (n === m) {
          i1 = (n - 1) * n / 2 + m - 1;
          pcup[i] = z * pcup[i1];
          dpcup[i] = z * dpcup[i1] + x * pcup[i1];
        } else if (n === 1 && m === 0) {
          i1 = (n - 1) * n / 2 + m;
          pcup[i] = x * pcup[i1];
          dpcup[i] = x * dpcup[i1] - z * pcup[i1];
        } else {
          i1 = (n - 2) * (n - 1) / 2 + m;
          i2 = (n - 1) * n / 2 + m;
          if (m > n - 2) {
            pcup[i] = x * pcup[i2];
            dpcup[i] = x * dpcup[i2] - z * pcup[i2];
          } else {
            k = ((n - 1) * (n - 1) - m * m) / ((2 * n - 1) * (2 * n - 3));
            pcup[i] = x * pcup[i2] - k * pcup[i1];
            dpcup[i] = x * dpcup[i2] - z * pcup[i2] - k * dpcup[i1];
          }
        }
      }
    }

    for (n = 1; n <= n_max; n++) {
      i = n * (n + 1) / 2;
      i1 = (n - 1) * n / 2;
      schmidt[i] = schmidt[i1] * (2 * n - 1) / n;
      for (m = 1; m <= n; m++) {
        i = n * (n + 1) / 2 + m;
        i1 = n * (n + 1) / 2 + m - 1;
        schmidt[i] = schmidt[i1] * Math.sqrt(((n - m + 1) * (m === 1 ? 2 : 1)) / (n + m));
      }
    }

    for (n = 1; n <= n_max; n++) {
      for (m = 0; m <= n; m++) {
        i = n * (n + 1) / 2 + m;
        pcup[i] *= schmidt[i];
        dpcup[i] *= -schmidt[i];
      }
    }
    return { pcup: pcup, dpcup: dpcup };
  }

  // ── Harmonic variables ────────────────────────────────────────────────
  function harmonicVars(sph, n_max) {
    var cos_l = Math.cos(sph.lambda * Math.PI / 180);
    var sin_l = Math.sin(sph.lambda * Math.PI / 180);
    var cos_ml = [1.0, cos_l];
    var sin_ml = [0.0, sin_l];
    var rrp = [(re / sph.r) * (re / sph.r)];
    for (var n = 1; n <= n_max; n++) rrp[n] = rrp[n - 1] * (re / sph.r);
    for (var m = 2; m <= n_max; m++) {
      cos_ml[m] = cos_ml[m - 1] * cos_l - sin_ml[m - 1] * sin_l;
      sin_ml[m] = cos_ml[m - 1] * sin_l + sin_ml[m - 1] * cos_l;
    }
    return { relative_radius_power: rrp, cos_mlambda: cos_ml, sin_mlambda: sin_ml };
  }

  // ── Summation (magnetic field in spherical frame) ─────────────────────
  function summation(leg, hv, sph, g, h, n_max) {
    var bx = 0, by = 0, bz = 0;
    var rrp = hv.relative_radius_power;
    var cos_ml = hv.cos_mlambda;
    var sin_ml = hv.sin_mlambda;
    for (var n = 1; n <= n_max; n++) {
      for (var m = 0; m <= n; m++) {
        var i = n * (n + 1) / 2 + m;
        bz -= rrp[n] * (g[i] * cos_ml[m] + h[i] * sin_ml[m]) * (n + 1) * leg.pcup[i];
        by += rrp[n] * (g[i] * sin_ml[m] - h[i] * cos_ml[m]) * m * leg.pcup[i];
        bx -= rrp[n] * (g[i] * cos_ml[m] + h[i] * sin_ml[m]) * leg.dpcup[i];
      }
    }
    var cos_phi = Math.cos(sph.phig * Math.PI / 180);
    if (Math.abs(cos_phi) > 1e-10) by = by / cos_phi;
    return { bx: bx, by: by, bz: bz };
  }

  // ── Rotate spherical → geodetic frame ────────────────────────────────
  function rotate(mv, sph, lat) {
    var psi = Math.PI / 180 * (sph.phig - lat);
    return {
      bx: mv.bx * Math.cos(psi) - mv.bz * Math.sin(psi),
      by: mv.by,
      bz: mv.bx * Math.sin(psi) + mv.bz * Math.cos(psi),
    };
  }

  // ── Time-adjust coefficients ──────────────────────────────────────────
  function timedCoeffs(data, date) {
    var yr_int = date.getUTCFullYear();
    var frac = (date.valueOf() - Date.UTC(yr_int)) / (1000 * 3600 * 24 * 365);
    var dyear = yr_int + frac - data.epoch;
    var n_max = data.n_max;
    var sv = data.n_max_sec_var;
    var svb = sv * (sv + 1) / 2 + sv;
    var g = data.main_field_coeff_g.slice();
    var h = data.main_field_coeff_h.slice();
    for (var n = 1; n <= n_max; n++) {
      for (var m = 0; m <= n; m++) {
        var i = n * (n + 1) / 2 + m;
        if (i <= svb) {
          g[i] += dyear * data.secular_var_coeff_g[i];
          h[i] += dyear * data.secular_var_coeff_h[i];
        }
      }
    }
    return { g: g, h: h };
  }

  // ── Public API ────────────────────────────────────────────────────────
  /**
   * @param {number} lat  geodetic latitude (degrees)
   * @param {number} lon  longitude (degrees)
   * @param {number} alt  altitude in km above ellipsoid (default 0)
   * @param {Date}   date (default today)
   * @returns {{dec: number}}  declination in degrees (+ = east)
   */
  global.geoMag = function (lat, lon, alt, date) {
    alt = alt || 0;
    date = date || new Date();
    var coeffs = timedCoeffs(WMM2025, date);
    var sph = toSpherical(lat, lon, alt);
    var leg = legendre(sph.phig, WMM2025.n_max);
    var hv = harmonicVars(sph, WMM2025.n_max);
    var mv_sph = summation(leg, hv, sph, coeffs.g, coeffs.h, WMM2025.n_max);
    var mv_geo = rotate(mv_sph, sph, lat);
    var decl = 180 / Math.PI * Math.atan2(mv_geo.by, mv_geo.bx);
    return { dec: decl };
  };

}(window));
