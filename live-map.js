// L'ancienne illustration SVG ne fait plus partie de la mise en page : seule
// la carte interactive peut désormais occuper le cadre.
document.querySelector('.map-card .map')?.remove();
const mapCard = document.querySelector('.map-card');
const tileMap = document.querySelector('#tile-map');
const routeOverlay = document.querySelector('#route-overlay');
const map = L.map('live-map', { zoomControl: false, preferCanvas: true }).setView([43.698, 3.863], 14);
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Leaflet recalcule après la mise en page finale du navigateur mobile.
const refreshMapSize = () => {
  // Certains Chrome mobiles conservent la grille créée lorsque le cadre vaut
  // une tuile. _resetView reconstruit réellement la grille, y compris les
  // tuiles à droite et en bas, sans déplacer le point affiché.
  map._sizeChanged = true;
  map._resetView(map.getCenter(), map.getZoom(), true);
};
new ResizeObserver(refreshMapSize).observe(mapCard);
window.addEventListener('load', () => {
  [0, 250, 750, 1500].forEach(delay => window.setTimeout(refreshMapSize, delay));
});

const lidarLayer = L.tileLayer.wms('https://data.geopf.fr/wms-r/wms', {
  layers: 'IGNF_LIDAR-HD_MNH_ELEVATIONGRIDCOVERAGE.WGS84G', format: 'image/png', transparent: true,
  version: '1.3.0', opacity: .6, attribution: 'IGN LiDAR HD'
});
let lidarVisible = false;
let markers = [];
let routeLayer;
let routeCandidates = [];
let livePositionMarker;
let livePositionCircle;
let navigationWatchId;
let activeNavigationCandidate;
let navigationStepsData = [];
let navigationStepIndex = 0;
let navigationDistanceToNext;
let userStartPoint;
const dataLayers = L.layerGroup().addTo(map);
const directionsLink = document.querySelector('#osm-directions');
const mapNote = document.querySelector('#map-note');
const routeStatus = document.querySelector('#route-status');
const departureInput = document.querySelector('#departure-time');
const navigationPanel = document.querySelector('#navigation-panel');
const navigationStatus = document.querySelector('#navigation-status');
const navigationSteps = document.querySelector('#navigation-steps');
const navigationHud = document.querySelector('#navigation-hud');
const navigationCurrentStep = document.querySelector('#navigation-current-step');
const navigationFollowingStep = document.querySelector('#navigation-following-step');
const navigationArrow = document.querySelector('#navigation-arrow');
const navigationTrip = document.querySelector('#navigation-trip');
const navigationRemaining = document.querySelector('#navigation-remaining');
const navigationArrival = document.querySelector('#navigation-arrival');
const counters = {
  tree: document.querySelector('#tree-count'), water: document.querySelector('#water-count'),
  building: document.querySelector('#building-count'), crossing: document.querySelector('#crossing-count'),
  buildingHeight: document.querySelector('#building-height-count'), treeHeight: document.querySelector('#tree-height-count'),
  lidar: document.querySelector('#lidar-count')
};

let activeTilePath;
let activeTileColor = '#e8a634';
let activeTileShowRoute = false;
function renderTileMap(path, routeColor = activeTileColor, showRoute = activeTileShowRoute) {
  activeTilePath = path;
  activeTileColor = routeColor;
  activeTileShowRoute = showRoute;
  const latitudes = path.map(point => point[0]);
  const longitudes = path.map(point => point[1]);
  const south = Math.min(...latitudes), north = Math.max(...latitudes);
  const west = Math.min(...longitudes), east = Math.max(...longitudes);
  const centerLat = (south + north) / 2, centerLon = (west + east) / 2;
  const rect = tileMap.getBoundingClientRect();
  const width = Math.max(1, rect.width), height = Math.max(1, rect.height);
  const mercator = (latitude, longitude, zoom) => {
    const pixels = 256 * 2 ** zoom;
    const x = (longitude + 180) / 360 * pixels;
    const radians = latitude * Math.PI / 180;
    const y = (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * pixels;
    return [x, y];
  };
  let zoom = 17;
  while (zoom > 12) {
    const a = mercator(south, west, zoom), b = mercator(north, east, zoom);
    if (Math.abs(a[0] - b[0]) < width * .58 && Math.abs(a[1] - b[1]) < height * .58) break;
    zoom--;
  }
  const center = mercator(centerLat, centerLon, zoom);
  const centerTileX = Math.floor(center[0] / 256), centerTileY = Math.floor(center[1] / 256);
  const tileCount = 2 ** zoom;
  let tileHtml = '';
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const tileY = centerTileY + dy;
    if (tileY < 0 || tileY >= tileCount) continue;
    const tileX = (centerTileX + dx + tileCount) % tileCount;
    const left = width / 2 + (centerTileX + dx) * 256 - center[0];
    const top = height / 2 + tileY * 256 - center[1];
    tileHtml += `<img alt="" draggable="false" src="https://tile.openstreetmap.org/${zoom}/${tileX}/${tileY}.png" style="left:${left}px;top:${top}px">`;
  }
  tileMap.innerHTML = tileHtml;
  const project = ([latitude, longitude]) => {
    const point = mercator(latitude, longitude, zoom);
    return [width / 2 + point[0] - center[0], height / 2 + point[1] - center[1]];
  };
  if (!showRoute) {
    routeOverlay.innerHTML = '';
    return;
  }
  const points = path.map(point => project(point).map(value => value.toFixed(1)).join(',')).join(' ');
  const first = project(path[0]), last = project(path.at(-1));
  routeOverlay.setAttribute('viewBox', `0 0 ${width} ${height}`);
  routeOverlay.innerHTML = `<polyline class="route-shadow" points="${points}"/><polyline class="route-line" style="stroke:${routeColor}" points="${points}"/><circle class="route-start" cx="${first[0].toFixed(1)}" cy="${first[1].toFixed(1)}" r="10"/><circle class="route-end" cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="10"/>`;
}

renderTileMap([[43.692, 3.855], [43.704, 3.872]], '#e8a634', false);
new ResizeObserver(() => { if (activeTilePath) renderTileMap(activeTilePath, activeTileColor, activeTileShowRoute); }).observe(tileMap);

function dateTimeLocalValue(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

if (departureInput && !departureInput.value) departureInput.value = dateTimeLocalValue(new Date());
if (departureInput) departureInput.addEventListener('change', () => departureInput.blur());

document.querySelector('#toggle-lidar').addEventListener('click', () => {
  lidarVisible = !lidarVisible;
  lidarVisible ? lidarLayer.addTo(map) : map.removeLayer(lidarLayer);
  mapNote.textContent = lidarVisible ? 'Couche LiDAR HD affichée : hauteur du sursol' : 'Couche LiDAR HD masquée';
});

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`service indisponible (${response.status})`);
  return response.json();
}

async function geocode(place) {
  const results = await fetchJson(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=fr&q=${encodeURIComponent(`${place}, Hérault`)}`);
  if (!results[0]) throw new Error('Lieu introuvable');
  return [Number(results[0].lat), Number(results[0].lon)];
}

async function getWalkingRoutes(start, end) {
  const coordinates = `${start[1]},${start[0]};${end[1]},${end[0]}`;
  const result = await fetchJson(`https://routing.openstreetmap.de/routed-foot/route/v1/driving/${coordinates}?overview=full&geometries=geojson&alternatives=true&steps=true`);
  if (!result.routes?.length) throw new Error('Itinéraire indisponible');
  return result.routes.map(route => ({
    ...route,
    path: route.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude])
  }));
}

async function getWalkingRouteVia(start, waypoint, end) {
  const [firstOptions, secondOptions] = await Promise.all([
    getWalkingRoutes(start, waypoint),
    getWalkingRoutes(waypoint, end)
  ]);
  const first = [...firstOptions].sort((a, b) => a.duration - b.duration)[0];
  const second = [...secondOptions].sort((a, b) => a.duration - b.duration)[0];
  return {
    distance: first.distance + second.distance,
    duration: first.duration + second.duration,
    path: [...first.path, ...second.path.slice(1)],
    legs: [...(first.legs || []), ...(second.legs || [])],
    pilotWaypoint: 'Ça pousse à Lez'
  };
}

function isInsidePradesPilot(point) {
  return point[0] >= 43.682 && point[0] <= 43.714 && point[1] >= 3.846 && point[1] <= 3.884;
}

function corridorBounds(points) {
  const bounds = L.latLngBounds(points);
  const padding = .0018;
  return [bounds.getSouth() - padding, bounds.getWest() - padding, bounds.getNorth() + padding, bounds.getEast() + padding];
}

function distanceToRoute(point, path) {
  return Math.min(...path.map(segmentPoint => Math.hypot(point[0] - segmentPoint[0], point[1] - segmentPoint[1])));
}

async function loadContextData(bounds) {
  const [south, west, north, east] = bounds;
  const box = `${south},${west},${north},${east}`;
  const query = `[out:json][timeout:25];(way["building"](${box});node["natural"="tree"](${box});node["amenity"="drinking_water"](${box});node["highway"="crossing"](${box}););out center tags;`;
  const request = url => fetchJson(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: query });
  let result;
  try {
    result = await request('https://overpass-api.de/api/interpreter');
    // Un périmètre urbain de Prades sans aucun objet est une réponse incomplète,
    // pas une absence réelle d'arbres ou de bâtiments.
    if (!result.elements?.length) throw new Error('réponse cartographique vide');
  } catch (primaryError) {
    result = await request('https://overpass.kumi.systems/api/interpreter');
    if (!result.elements?.length) throw new Error('réponse cartographique vide');
  }
  const counts = { tree: 0, water: 0, building: 0, crossing: 0, buildingHeight: 0, treeHeight: 0 };
  const context = { trees: [], waters: [] };
  dataLayers.clearLayers();
  result.elements.forEach(element => {
    const tags = element.tags || {};
    const point = element.lat ? [element.lat, element.lon] : element.center ? [element.center.lat, element.center.lon] : null;
    if (tags.building) {
      counts.building++;
      if (tags.height || tags['building:levels']) counts.buildingHeight++;
      if (point) L.circleMarker(point, { radius: 2, color: '#859e7a', fillOpacity: .35, weight: 1 }).addTo(dataLayers);
    }
    if (tags.natural === 'tree') {
      counts.tree++;
      if (tags.height || tags.est_height || tags.circumference) counts.treeHeight++;
      if (point) {
        context.trees.push(point);
        L.circleMarker(point, { radius: 3, color: '#397a45', fillColor: '#81b64c', fillOpacity: .85 }).bindPopup('Arbre cartographié').addTo(dataLayers);
      }
    }
    if (tags.amenity === 'drinking_water') {
      counts.water++;
      if (point) {
        context.waters.push(point);
        L.marker(point, { icon: L.divIcon({ className: 'water-marker', html: '💧', iconSize: [22, 22] }) }).bindPopup('Point d’eau signalé — disponibilité à vérifier.').addTo(dataLayers);
      }
    }
    if (tags.highway === 'crossing') {
      counts.crossing++;
      if (point) L.circleMarker(point, { radius: 3, color: '#c78a25', fillOpacity: .8 }).addTo(dataLayers);
    }
  });
  Object.entries(counts).forEach(([key, value]) => { counters[key].textContent = value; });
  return context;
}

async function loadWeather(position) {
  try {
    const data = await fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${position[0]}&longitude=${position[1]}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,cloud_cover,shortwave_radiation&timezone=auto`);
    const current = data.current;
    document.querySelector('#weather-pill').innerHTML = `<span>☀</span> ${Math.round(current.temperature_2m)}° · Ressenti ${Math.round(current.apparent_temperature)}° <b>·</b> vent ${Math.round(current.wind_speed_10m)} km/h`;
    return current;
  } catch { /* la météo ne bloque jamais le tracé */ }
}

// Position solaire calculée localement à partir de l'heure et du lieu : aucune saisie utilisateur.
function solarPosition(date, latitude, longitude) {
  const radians = Math.PI / 180;
  const julian = date.getTime() / 86400000 + 2440587.5;
  const days = julian - 2451545.0;
  const meanLongitude = (280.46 + .9856474 * days) % 360;
  const meanAnomaly = (357.528 + .9856003 * days) % 360;
  const eclipticLongitude = meanLongitude + 1.915 * Math.sin(meanAnomaly * radians) + .02 * Math.sin(2 * meanAnomaly * radians);
  const obliquity = 23.439 - .0000004 * days;
  const declination = Math.asin(Math.sin(obliquity * radians) * Math.sin(eclipticLongitude * radians));
  const rightAscension = Math.atan2(Math.cos(obliquity * radians) * Math.sin(eclipticLongitude * radians), Math.cos(eclipticLongitude * radians)) / radians;
  const sidereal = (280.16 + 360.9856235 * days + longitude) % 360;
  const hourAngle = ((sidereal - rightAscension + 540) % 360 - 180) * radians;
  const lat = latitude * radians;
  const altitude = Math.asin(Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle));
  const azimuth = (Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(lat) - Math.tan(declination) * Math.cos(lat)) / radians + 180) % 360;
  return { altitude: altitude / radians, azimuth };
}

function cardinalDirection(azimuth) {
  return ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest'][Math.round(azimuth / 45) % 8];
}

function pathSamples(path, count = 16) {
  if (path.length <= count) return path;
  return Array.from({ length: count }, (_, index) => path[Math.round(index * (path.length - 1) / (count - 1))]);
}

function pointTowards(point, azimuth, meters) {
  const angle = azimuth * Math.PI / 180;
  return [
    point[0] + Math.cos(angle) * meters / 111320,
    point[1] + Math.sin(angle) * meters / (111320 * Math.cos(point[0] * Math.PI / 180))
  ];
}

async function lidarElevations(points, resource) {
  if (resource.includes('mnx')) {
    try {
      const pointsText = points.map(([lat, lon]) => `${lat.toFixed(7)},${lon.toFixed(7)}`).join('|');
      const local = await fetchJson(`/api/lidar?points=${encodeURIComponent(pointsText)}`);
      if (Array.isArray(local.elevations) && local.elevations.some(value => Number.isFinite(value))) return local.elevations;
    } catch { /* hors pilote : appel IGN ci-dessous */ }
  }
  // L'API IGN accepte un nombre limité de coordonnées par requête. Le découpage
  // garantit qu'un trajet complet de Prades n'échoue pas silencieusement.
  const batchSize = 24;
  const elevations = [];
  const resources = resource.includes('_multi_wld') ? [resource, resource.replace('_multi_wld', '_mono_wld')] : [resource];
  for (let start = 0; start < points.length; start += batchSize) {
    const batch = points.slice(start, start + batchSize);
    const separator = '|';
    const lon = batch.map(point => point[1].toFixed(7)).join(separator);
    const lat = batch.map(point => point[0].toFixed(7)).join(separator);
    let batchValues;
    let lastError;
    for (const candidateResource of resources) {
      try {
        const url = `https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=${lon}&lat=${lat}&resource=${candidateResource}&delimiter=${encodeURIComponent(separator)}`;
        const data = await fetchJson(url);
        if (!Array.isArray(data.elevations)) throw new Error('réponse LiDAR IGN inexploitable');
        batchValues = data.elevations.map(value => typeof value === 'number' ? value : value.z);
        break;
      } catch (error) {
        lastError = error;
      }
    }
    // Un trou de couverture ou une dalle momentanément indisponible ne doit
    // pas invalider l'ensemble de l'itinéraire : on conserve l'alignement des
    // points et l'analyse utilisera seulement les mesures réellement reçues.
    elevations.push(...(batchValues || Array(batch.length).fill(null)));
  }
  return elevations;
}

async function localMnhElevations(points) {
  const pointsText = points.map(([lat, lon]) => `${lat.toFixed(7)},${lon.toFixed(7)}`).join('|');
  const local = await fetchJson(`/api/lidar?points=${encodeURIComponent(pointsText)}`);
  if (!Array.isArray(local.elevations)) throw new Error('réponse MNH locale inexploitable');
  return { surface: local.elevations, terrain: Array.isArray(local.terrain) ? local.terrain : null };
}

async function estimateLidarShade(path, durationSeconds, departure) {
  // Un point tous les ~20 m sur le pilote : les arbres d'alignement et la
  // canopée au-dessus du trottoir seraient invisibles avec 8 seuls points.
  const observers = pathSamples(path, 40);
  const distances = [2, 4, 7, 10, 15, 25, 40, 60, 90, 125];
  const sunByObserver = observers.map((point, index) => {
    const moment = new Date(departure.getTime() + durationSeconds * 1000 * index / Math.max(1, observers.length - 1));
    return solarPosition(moment, point[0], point[1]);
  });
  const daylight = sunByObserver.filter(sun => sun.altitude > 1).length;
  if (!daylight) return { state: 'night', samples: 0 };
  const allPoints = observers.flatMap((observer, index) => [observer, ...distances.map(distance => pointTowards(observer, sunByObserver[index].azimuth, distance))]);
  let terrain, surface, localMnh = false;
  try {
    const local = await localMnhElevations(allPoints);
    surface = local.surface;
    terrain = local.terrain;
    if (!surface.some(value => Number.isFinite(value))) throw new Error('pas de couverture locale');
    localMnh = true;
  } catch {
    [terrain, surface] = await Promise.all([
      lidarElevations(allPoints, 'ign_lidar_hd_mnt_multi_wld'),
      lidarElevations(allPoints, 'ign_lidar_hd_mnx_multi_wld')
    ]);
  }
  const valid = value => Number.isFinite(value) && value > -99900;
  let usable = 0;
  let shaded = 0;
  let evaluableObservers = 0;
  const width = distances.length + 1;
  observers.forEach((_, observerIndex) => {
    const sun = sunByObserver[observerIndex];
    if (sun.altitude <= 1) return;
    const offset = observerIndex * width;
    if ((!localMnh || terrain) && !valid(terrain?.[offset])) return;
    let protectedHere = false;
    let hasObstacleMeasure = false;
    // Une valeur MNH élevée exactement à l'emplacement du marcheur indique
    // une canopée ou un surplomb : ce cas est fréquent sous des platanes.
    if (valid(surface[offset])) {
      usable++;
      hasObstacleMeasure = true;
      if (surface[offset] >= 3) protectedHere = true;
    }
    distances.forEach((distance, distanceIndex) => {
      const index = offset + distanceIndex + 1;
      if (!valid(surface[index]) || ((!localMnh || terrain) && !valid(terrain?.[index]))) return;
      usable++;
      hasObstacleMeasure = true;
      // Avec MNT + MNH, la hauteur de l'obstacle est ramenée au niveau du marcheur.
      const obstacleHeight = localMnh ? surface[index] + (terrain ? terrain[index] - terrain[offset] : 0) : surface[index] - terrain[index];
      const requiredHeight = 1.6 + Math.tan(sun.altitude * Math.PI / 180) * distance;
      if (obstacleHeight >= requiredHeight) protectedHere = true;
    });
    if (hasObstacleMeasure) {
      evaluableObservers++;
      if (protectedHere) shaded++;
    }
  });
  const coverage = daylight ? evaluableObservers / daylight : 0;
  return {
    state: coverage >= .6 ? 'ok' : usable ? 'partial' : 'unavailable',
    samples: usable, shaded, observers: daylight, evaluableObservers,
    coverage, share: evaluableObservers ? shaded / evaluableObservers : 0
  };
}

function comfortEstimate(weather, lidar, candidate) {
  if (!weather) return null;
  const apparent = Number(weather.apparent_temperature ?? weather.temperature_2m);
  const shade = lidar.state === 'ok' ? lidar.share : lidar.state === 'night' ? 1 : .25;
  const clouds = Number(weather.cloud_cover || 0) / 100;
  const windRelief = Math.min(1.5, Number(weather.wind_speed_10m || 0) * .12);
  const vegetationRelief = Math.min(2, Number(candidate.nearTrees || 0) * .2);
  const sunLoad = (1 - shade) * (1 - clouds * .6) * 6;
  const score = Math.max(0, Math.min(100, Math.round((apparent - 18) * 3 + sunLoad * 4 - windRelief * 2 - vegetationRelief * 2)));
  const label = score < 25 ? 'Confortable' : score < 50 ? 'À surveiller' : score < 70 ? 'Chaud' : 'Très chaud';
  return { score, label, apparent: Math.round(apparent), shade: Math.round(shade * 100), wind: Math.round(weather.wind_speed_10m || 0) };
}

function lidarPercent(candidate) {
  return candidate.lidar?.state === 'ok' ? Math.round(candidate.lidar.share * 100) : null;
}

function shadeLabel(candidate) {
  const percent = lidarPercent(candidate);
  return percent === null ? 'Ombre non mesurée' : `${percent}% du trajet à l’ombre`;
}

function renderPilotComparisons(candidates, weather, departure, sunLabel) {
  const cards = document.querySelectorAll('.route-option');
  const fastest = [...candidates].sort((a, b) => a.duration - b.duration)[0];
  const measured = candidates.filter(candidate => candidate.lidar?.state === 'ok');
  const shadeAlternative = measured.filter(candidate => candidate !== fastest).sort((a, b) => b.lidar.share - a.lidar.share || a.duration - b.duration)[0];
  const routableAlternative = candidates.filter(candidate => candidate !== fastest).sort((a, b) => a.duration - b.duration)[0];
  const coolCandidates = measured.map(candidate => ({ candidate, comfort: comfortEstimate(weather, candidate.lidar, candidate) })).filter(item => item.comfort);
  const fastComfort = coolCandidates.find(item => item.candidate === fastest)?.comfort;
  const coolAlternative = coolCandidates.filter(item => item.candidate !== fastest).sort((a, b) => a.comfort.score - b.comfort.score || a.candidate.duration - b.candidate.duration)[0];
  const setRoute = (card, candidate, title, detail, stats, label) => {
    card.querySelector('.route-copy strong').textContent = title;
    card.querySelector('.route-copy small').textContent = detail;
    card.querySelector('.route-stats').innerHTML = stats;
    card.onclick = () => {
      showCandidate(candidate, label);
      counters.lidar.textContent = candidate.lidar?.samples ?? '—';
      const insight = document.querySelector('#insight p');
      if (insight) insight.textContent = `${sunLabel} Résultat LiDAR : ${lidarPercent(candidate)}% des points du trajet sont potentiellement protégés. À valider sur le terrain.`;
    };
  };
  setRoute(cards[0], fastest, 'Le plus rapide', shadeLabel(fastest), `<b>${Math.round(fastest.duration / 60)} min</b><small>${(fastest.distance / 1000).toFixed(1).replace('.', ',')} km</small>`, 'fast');
  if (shadeAlternative) {
    const via = shadeAlternative.pilotWaypoint ? ' · via microferme' : '';
    const fasterShade = shadeAlternative.lidar.share > (fastest.lidar?.share ?? -1);
    setRoute(cards[1], shadeAlternative, fasterShade ? 'Le plus à l’ombre' : 'Alternative analysée', `${shadeLabel(shadeAlternative)}${via}`, `<b>${Math.round(shadeAlternative.duration / 60)} min</b><small>${(shadeAlternative.distance / 1000).toFixed(1).replace('.', ',')} km</small>`, fasterShade ? 'shade' : 'alternative');
  } else {
    if (routableAlternative) {
      const via = routableAlternative.pilotWaypoint ? ' · via rue de la Peyrade' : '';
      setRoute(cards[1], routableAlternative, 'Alternative routable', `LiDAR indisponible${via}`, `<b>${Math.round(routableAlternative.duration / 60)} min</b><small>${(routableAlternative.distance / 1000).toFixed(1).replace('.', ',')} km</small>`, 'alternative');
    } else {
      cards[1].querySelector('.route-copy strong').textContent = 'Ombre non confirmée';
      cards[1].querySelector('.route-copy small').textContent = 'Pas d’alternative routable';
      cards[1].querySelector('.route-stats').innerHTML = '<b>—</b><small>ne pas deviner</small>';
      cards[1].onclick = null;
    }
  }
  if (coolAlternative && (!fastComfort || coolAlternative.comfort.score < fastComfort.score)) {
    const { candidate, comfort } = coolAlternative;
    const shadeGain = Math.max(0, comfort.shade - (fastComfort?.shade ?? 0));
    setRoute(cards[2], candidate, 'Le plus frais', `${shadeLabel(candidate)} · ressenti estimé ${comfort.apparent}°`, `<b>${Math.round(candidate.duration / 60)} min</b><small>${shadeGain ? `+${shadeGain} points d’ombre` : 'moins exposé au soleil'}</small>`, 'cool');
  } else {
    const source = coolAlternative?.candidate || fastest;
    setRoute(cards[2], source, 'Pas de trajet plus frais', `${shadeLabel(source)} · aucun gain de fraîcheur mesuré`, `<b>${Math.round(source.duration / 60)} min</b><small>confort comparable</small>`, source === fastest ? 'fast' : 'alternative');
  }
}

function score(candidate, context) {
  const trees = context.trees.filter(point => distanceToRoute(point, candidate.path) < .00022).length;
  const waters = context.waters.filter(point => distanceToRoute(point, candidate.path) < .00025).length;
  candidate.nearTrees = trees;
  candidate.nearWaters = waters;
  candidate.greenScore = trees * 4 + waters * 2 - (candidate.duration / 60) * .06;
  return candidate;
}

function directionText(step) {
  const type = step.maneuver?.type;
  const modifierLabels = {
    left: 'à gauche', right: 'à droite', straight: 'tout droit',
    'slight left': 'légèrement à gauche', 'slight right': 'légèrement à droite',
    'sharp left': 'franchement à gauche', 'sharp right': 'franchement à droite',
    uturn: 'fais demi-tour'
  };
  const modifier = modifierLabels[step.maneuver?.modifier] || escapeHtml(step.maneuver?.modifier || '');
  const road = step.name ? ` sur ${escapeHtml(step.name)}` : '';
  if (type === 'depart') return `Pars${road || ' à pied'}`;
  if (type === 'arrive') return 'Tu es arrivé·e à destination';
  if (type === 'turn') return modifier === 'fais demi-tour' ? `Fais demi-tour${road}` : `Tourne ${modifier}${road}`.replace(/\s+/g, ' ');
  if (type === 'continue' || type === 'new name') return `Continue${road}`;
  if (type === 'roundabout' || type === 'rotary') return `Prends le rond-point puis sors${road}`;
  if (type === 'end of road') return `Au bout de la rue, tourne ${modifier}${road}`;
  return `Continue${road}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
}

function distanceText(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(meters)} m`;
}

function walkingDistance(from, to) {
  const earth = 6371000;
  const radians = Math.PI / 180;
  const lat = (to[0] - from[0]) * radians;
  const lon = (to[1] - from[1]) * radians;
  const a = Math.sin(lat / 2) ** 2 + Math.cos(from[0] * radians) * Math.cos(to[0] * radians) * Math.sin(lon / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function stepPoint(step) {
  const point = step?.maneuver?.location;
  return Array.isArray(point) ? [point[1], point[0]] : null;
}

function renderNavigationSteps() {
  navigationSteps.innerHTML = navigationStepsData.map((step, index) => {
    const current = index === navigationStepIndex;
    const distance = current && Number.isFinite(navigationDistanceToNext) ? `Dans ${distanceText(navigationDistanceToNext)}` : distanceText(step.distance || 0);
    return `<li class="${current ? 'active-step' : ''}">${directionText(step)}<small>${distance}</small></li>`;
  }).join('') || '<li>Les instructions détaillées ne sont pas disponibles pour ce trajet.</li>';

  const currentStep = navigationStepsData[navigationStepIndex];
  if (!currentStep) {
    navigationHud.hidden = true;
    navigationTrip.hidden = true;
    return;
  }
  navigationHud.hidden = false;
  navigationTrip.hidden = false;
  const currentDistance = Number.isFinite(navigationDistanceToNext)
    ? distanceText(navigationDistanceToNext)
    : distanceText(currentStep.distance || 0);
  const followingStep = navigationStepsData[navigationStepIndex + 1];
  navigationArrow.textContent = maneuverArrow(currentStep);
  navigationCurrentStep.innerHTML = `<small>Dans ${currentDistance}</small><strong>${directionText(currentStep)}</strong>`;
  navigationFollowingStep.textContent = followingStep ? `Puis ${directionText(followingStep).replace(/^Continue\s*/i, 'continue ')}` : 'Dernière étape du trajet';
  const remainingMeters = navigationStepsData.slice(navigationStepIndex).reduce((total, step) => total + (step.distance || 0), 0);
  const totalMeters = navigationStepsData.reduce((total, step) => total + (step.distance || 0), 0) || activeNavigationCandidate?.distance || 0;
  const duration = activeNavigationCandidate?.duration || 0;
  const remainingMinutes = Math.max(1, Math.round((duration * (remainingMeters / totalMeters)) / 60));
  const arrival = new Date(Date.now() + remainingMinutes * 60 * 1000);
  navigationRemaining.textContent = `${remainingMinutes} min · ${distanceText(remainingMeters)}`;
  navigationArrival.textContent = `Arrivée vers ${arrival.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}

function maneuverArrow(step) {
  const type = step?.maneuver?.type;
  const modifier = step?.maneuver?.modifier;
  if (type === 'arrive') return '●';
  if (modifier === 'left' || modifier === 'slight left' || modifier === 'sharp left') return '↰';
  if (modifier === 'right' || modifier === 'slight right' || modifier === 'sharp right') return '↱';
  if (modifier === 'uturn') return '↶';
  if (type === 'roundabout' || type === 'rotary') return '⟳';
  return '↑';
}

function updatePedestrianGuidance(point, accuracy) {
  if (!navigationStepsData.length) return;
  const reachDistance = Math.max(18, Math.min(45, accuracy * 1.5));
  while (navigationStepIndex < navigationStepsData.length - 1) {
    const target = stepPoint(navigationStepsData[navigationStepIndex]);
    if (!target || walkingDistance(point, target) > reachDistance) break;
    navigationStepIndex++;
  }
  const next = navigationStepsData[navigationStepIndex];
  const target = stepPoint(next);
  navigationDistanceToNext = target ? walkingDistance(point, target) : 0;
  const routeDistance = activeNavigationCandidate?.path?.length ? Math.min(...activeNavigationCandidate.path.map(routePoint => walkingDistance(point, routePoint))) : 0;
  if (routeDistance > Math.max(45, accuracy * 2)) {
    navigationStatus.textContent = `Tu t’éloignes du trajet (${Math.round(routeDistance)} m). Reviens vers le tracé affiché.`;
  } else if (next?.maneuver?.type === 'arrive' || navigationDistanceToNext < reachDistance) {
    navigationStatus.textContent = 'Tu es arrivé·e à destination.';
  } else {
    navigationStatus.textContent = `Dans ${distanceText(navigationDistanceToNext)}, ${directionText(next)} · précision ±${Math.round(accuracy)} m`;
  }
  renderNavigationSteps();
}

function renderDirections(candidate) {
  const steps = candidate.legs?.flatMap(leg => leg.steps || []) || [];
  activeNavigationCandidate = candidate;
  navigationStepsData = steps;
  navigationStepIndex = Math.max(0, steps.findIndex(step => step.maneuver?.type !== 'depart'));
  navigationDistanceToNext = undefined;
  navigationPanel.hidden = false;
  navigationStatus.textContent = `${steps.length} indication(s) · ${Math.round(candidate.duration / 60)} min à pied`;
  renderNavigationSteps();
}

function showCandidate(candidate, label) {
  if (routeLayer) routeLayer.remove();
  const colors = { fast: '#e8a634', shade: '#27805c', alternative: '#27805c', cool: '#278a9b' };
  routeLayer = L.polyline(candidate.path, { color: colors[label] || colors.fast, weight: 7, opacity: 1 }).addTo(map);
  routeLayer.bringToFront();
  map.fitBounds(routeLayer.getBounds(), { padding: [32, 32] });
  renderTileMap(candidate.path, colors[label] || colors.fast, true);
  window.setTimeout(refreshMapSize, 80);
  const cards = document.querySelectorAll('.route-option');
  cards.forEach(card => card.classList.remove('active'));
  if (label === 'fast') cards[0]?.classList.add('active');
  if (label === 'shade' || label === 'alternative') cards[1]?.classList.add('active');
  if (label === 'cool') cards[2]?.classList.add('active');
  const km = (candidate.distance / 1000).toFixed(1).replace('.', ',');
  const minutes = Math.round(candidate.duration / 60);
  const routeName = label === 'shade' ? 'Alternative ombragée (bêta)' : label === 'alternative' ? 'Alternative routable · ombre non mesurée' : 'Trajet piéton de référence';
  mapNote.textContent = `${routeName} · ${km} km · ${minutes} min`;
  const insight = document.querySelector('#insight p');
  if (insight) insight.textContent = `${label === 'shade' ? 'Alternative sélectionnée' : 'Trajet rapide sélectionné'} : le tracé est maintenant mis en évidence sur la carte.`;
  renderDirections(candidate);
}

function renderComparisons(candidates, context) {
  const fastest = [...candidates].sort((a, b) => a.duration - b.duration)[0];
  const greenest = [...candidates].sort((a, b) => b.greenScore - a.greenScore)[0];
  const cards = document.querySelectorAll('.route-option');
  if (!fastest || !cards.length) return;
  cards[0].querySelector('.route-copy strong').textContent = 'Le plus rapide';
  cards[0].querySelector('.route-copy small').textContent = 'Itinéraire piéton réel';
  cards[0].querySelector('.route-stats').innerHTML = `<b>${Math.round(fastest.duration / 60)} min</b><small>${(fastest.distance / 1000).toFixed(1).replace('.', ',')} km</small>`;
  cards[0].onclick = () => showCandidate(fastest, 'fast');
  if (context && candidates.length > 1) {
    cards[1].querySelector('.route-copy strong').textContent = 'Le plus végétalisé';
    cards[1].querySelector('.route-copy small').textContent = 'Bêta : arbres cartographiés proches';
    cards[1].querySelector('.route-stats').innerHTML = `<b>${Math.round(greenest.duration / 60)} min</b><small>${greenest.nearTrees} arbres proches</small>`;
    cards[1].onclick = () => showCandidate(greenest, 'shade');
  } else {
    cards[1].querySelector('.route-copy strong').textContent = candidates.length > 1 ? 'Données végétales indisponibles' : 'Alternative non trouvée';
    cards[1].querySelector('.route-copy small').textContent = candidates.length > 1 ? 'Le tracé reste utilisable' : 'Le réseau n’en propose qu’une ici';
    cards[1].querySelector('.route-stats').innerHTML = '<b>—</b><small>à réessayer</small>';
    cards[1].onclick = () => {
      mapNote.textContent = 'Aucune seconde alternative piétonne n’a été fournie pour ce trajet.';
      const insight = document.querySelector('#insight p');
      if (insight) insight.textContent = 'Pour comparer deux itinéraires, il faut qu’une seconde option piétonne soit disponible sur ce réseau.';
    };
  }
  cards[2].querySelector('.route-copy strong').textContent = 'Fraîcheur : à venir';
  cards[2].querySelector('.route-copy small').textContent = 'Soleil et hauteurs LiDAR non calculés';
  cards[2].querySelector('.route-stats').innerHTML = '<b>—</b><small>pas encore calculé</small>';
  cards[2].onclick = () => {
    mapNote.textContent = 'La fraîcheur complète n’est pas encore prête.';
    const insight = document.querySelector('#insight p');
    if (insight) insight.textContent = 'La température ressentie dépend aussi de l’humidité, du vent, des matériaux et de l’ombre : elle ne sera affichée qu’après un calcul fiable.';
  };
}

async function showPlaces() {
  const from = document.querySelector('#from').value.trim();
  const to = document.querySelector('#to').value.trim();
  if (!to || (!from && !userStartPoint)) {
    routeStatus.textContent = 'Indique une destination et un point de départ, ou utilise ta position.';
    return;
  }
  const chosenDate = departureInput?.value ? new Date(departureInput.value) : new Date();
  const departure = Number.isNaN(chosenDate.getTime()) ? new Date() : chosenDate;
  mapNote.textContent = 'Calcul de l’itinéraire piéton…';
  routeStatus.textContent = 'Recherche du tracé piéton…';
  let start, end;
  try {
    [start, end] = await Promise.all([userStartPoint || geocode(from), geocode(to)]);
    routeCandidates = await getWalkingRoutes(start, end);
    // Alternative pilote : elle est calculée uniquement sur le réseau piéton
    // routable, sans présumer qu'un passage agricole est public.
    if (isInsidePradesPilot(start) && isInsidePradesPilot(end)) {
      try {
        let microferme;
        try {
          microferme = await geocode('Ça pousse à Lez, rue de la Peyrade, Prades-le-Lez');
        } catch {
          // L'entrée est confirmée localement au croisement de la rue des
          // Érables ; quand le commerce n'est pas géocodé, la rue de la
          // Peyrade reste le point d'ancrage public du détour pilote.
          microferme = await geocode('Rue de la Peyrade, Prades-le-Lez');
        }
        const viaMicroferme = await getWalkingRouteVia(start, microferme, end);
        routeCandidates.push(viaMicroferme);
      } catch (error) {
        console.info('Alternative microferme indisponible sur le réseau routable', error);
      }
    }
  } catch (error) {
    console.error('Chargement du trajet impossible', error);
    mapNote.textContent = 'Le service de trajet ne répond pas pour le moment.';
    routeStatus.textContent = 'Réessaie dans un instant. La carte reste disponible, mais aucun tracé n’a été inventé.';
    return;
  }
  markers.forEach(marker => marker.remove());
  markers = [L.marker(start).addTo(map).bindPopup(`Départ : ${from || 'ma position actuelle'}`), L.marker(end).addTo(map).bindPopup(`Arrivée : ${to}`)];
  const fastest = [...routeCandidates].sort((a, b) => a.duration - b.duration)[0];
  showCandidate(fastest, 'fast');
  const insight = document.querySelector('#insight p');
  const sun = solarPosition(departure, start[0], start[1]);
  const departureLabel = departure.toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  const sunLabel = sun.altitude > 0 ? `Soleil à ${Math.round(sun.altitude)}° au-dessus de l’horizon, venant du ${cardinalDirection(sun.azimuth)}.` : 'Le soleil est sous l’horizon.';
  if (insight) insight.textContent = `${sunLabel} Recherche des mesures LiDAR et des alternatives piétonnes routables.`;
  directionsLink.href = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=${start[0]}%2C${start[1]}%3B${end[0]}%2C${end[1]}`;
  routeStatus.textContent = `${routeCandidates.length} itinéraire(s) piéton(s) réel(s) chargé(s). Départ prévu ${departureLabel}. ${sunLabel} Les données d’arbres, d’eau et de hauteur se chargent maintenant.`;
  const weatherPromise = loadWeather(start);
  const lidarPromise = Promise.all(routeCandidates.map(async candidate => {
    try {
      candidate.lidar = await estimateLidarShade(candidate.path, candidate.duration, departure);
      return null;
    } catch (error) {
      console.warn('Analyse LiDAR indisponible pour ce trajet', error);
      candidate.lidar = { state: 'unavailable', samples: 0, share: 0, observers: 0 };
      return error?.message || 'réponse LiDAR indisponible';
    }
  }));
  let contextData = null;
  try {
    contextData = await loadContextData(corridorBounds(routeCandidates.flatMap(route => route.path)));
    routeCandidates.forEach(candidate => score(candidate, contextData));
    routeStatus.textContent = `${routeCandidates.length} itinéraire(s) piéton(s) réel(s) chargé(s). ${sunLabel} Analyse LiDAR de l’ombre en cours.`;
  } catch (error) {
    console.warn('Données de contexte indisponibles', error);
    routeStatus.textContent = `${routeCandidates.length} itinéraire(s) piéton(s) réel(s) chargé(s). Les données d’arbres et d’eau sont momentanément indisponibles.`;
  }
  const [weather, lidarErrors] = await Promise.all([weatherPromise, lidarPromise]);
  const lidarFailure = lidarErrors.find(Boolean) || '';
  counters.lidar.textContent = fastest.lidar?.samples || '—';
  renderPilotComparisons(routeCandidates, weather, departure, sunLabel);
  const covered = routeCandidates.filter(candidate => candidate.lidar?.state === 'ok').length;
  routeStatus.textContent = covered
    ? `${routeCandidates.length} parcours routables comparés · LiDAR exploitable sur ${covered}. Les alternatives affichées sont fondées sur ces mesures.`
    : `${routeCandidates.length} parcours routables trouvés, mais couverture LiDAR insuffisante : aucune alternative d’ombre n’est affirmée. Diagnostic IGN : ${lidarFailure || 'aucune hauteur disponible sur les points interrogés'}.`;
  if (!covered && insight) insight.textContent = `${sunLabel} Les mesures LiDAR IGN ne sont pas disponibles pour ce calcul : l’app ne classe donc aucun trajet « à l’ombre » ou « frais ». `;
}

document.querySelector('#search').addEventListener('click', showPlaces);
document.querySelector('#from').addEventListener('input', () => { userStartPoint = undefined; });
document.querySelector('#use-location').addEventListener('click', () => {
  if (!navigator.geolocation) {
    routeStatus.textContent = 'La localisation n’est pas disponible sur cet appareil.';
    return;
  }
  routeStatus.textContent = 'Recherche de ta position…';
  navigator.geolocation.getCurrentPosition(position => {
    userStartPoint = [position.coords.latitude, position.coords.longitude];
    document.querySelector('#from').value = 'Ma position actuelle';
    routeStatus.textContent = 'Position utilisée comme départ. Indique maintenant une destination.';
  }, () => {
    routeStatus.textContent = 'La position n’a pas été autorisée. Tu peux saisir ton point de départ.';
  }, { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 });
});
// Le pilote est centré sur Prades-le-Lez : la météo est utile avant même le premier trajet.
loadWeather([43.698, 3.863]);
document.querySelector('#start-navigation').addEventListener('click', () => {
  if (!routeLayer) {
    navigationStatus.textContent = 'Choisis d’abord un itinéraire.';
    return;
  }
  document.body.classList.add('navigation-mode');
  window.setTimeout(() => {
    refreshMapSize();
    map.fitBounds(routeLayer.getBounds(), { padding: [38, 24], animate: false });
  }, 80);
  if (!navigator.geolocation) {
    navigationStatus.textContent = 'La localisation n’est pas disponible sur cet appareil.';
    return;
  }
  navigationStatus.textContent = 'Autorise ta position pour démarrer le guidage piéton.';
  if (navigationWatchId) navigator.geolocation.clearWatch(navigationWatchId);
  navigationWatchId = navigator.geolocation.watchPosition(position => {
    const point = [position.coords.latitude, position.coords.longitude];
    if (!livePositionMarker) {
      livePositionMarker = L.circleMarker(point, { radius: 9, color: '#fff', weight: 3, fillColor: '#1671a5', fillOpacity: 1 }).addTo(map).bindPopup('Ta position');
      livePositionCircle = L.circle(point, { radius: position.coords.accuracy, color: '#1671a5', fillColor: '#6fc4ea', fillOpacity: .22 }).addTo(map);
    } else {
      livePositionMarker.setLatLng(point);
      livePositionCircle.setLatLng(point).setRadius(position.coords.accuracy);
    }
    map.setView(point, Math.max(map.getZoom(), 17));
    updatePedestrianGuidance(point, position.coords.accuracy);
  }, () => {
    navigationStatus.textContent = 'La position n’a pas été autorisée. Tu peux suivre les étapes ci-dessous.';
  }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
});

document.querySelector('#exit-navigation').addEventListener('click', () => {
  if (navigationWatchId) navigator.geolocation?.clearWatch(navigationWatchId);
  navigationWatchId = undefined;
  navigationHud.hidden = true;
  navigationTrip.hidden = true;
  document.body.classList.remove('navigation-mode');
  window.setTimeout(refreshMapSize, 80);
});
