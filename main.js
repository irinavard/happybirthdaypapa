//config
const WORLD_TOPO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
const DATA_URL = 'data/locations.json';

//state
let locations = [];
let projection, path, svg, g;
let currentPhotoIndex = 0;
let currentPhotos = [];
let zoom;

//init
async function init() {
  const [world, locs] = await Promise.all([
    d3.json(WORLD_TOPO_URL),
    d3.json(DATA_URL)
  ]);

  locations = locs;

  buildMap(world);
  buildMarkers();
  buildTimeline();
  bindModal();
}

//map
function buildMap(world) {
  const container = document.getElementById('map-container');
  const W = container.clientWidth;
  const H = container.clientHeight;

  svg = d3.select('#map')
    .attr('width', W)
    .attr('height', H);

  // Determine bounding box of locations to auto-center
  const lats = locations.map(d => d.lat);
  const lngs = locations.map(d => d.lng);
  const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;

  projection = d3.geoNaturalEarth1()
    .scale(W / 6.2)
    .center([centerLng, centerLat])
    .translate([W / 2, H / 2]);

  path = d3.geoPath().projection(projection);

  // Zoom behavior
  zoom = d3.zoom()
    .scaleExtent([0.5, 12])
    .on('zoom', (event) => {
      g.attr('transform', event.transform);
    });



  svg.call(zoom);

  g = svg.append('g');

  // graticule
  const graticule = d3.geoGraticule()();
  g.append('path')
    .datum(graticule)
    .attr('class', 'graticule')
    .attr('d', path);

  // countries
  const countries = topojson.feature(world, world.objects.countries);
  g.selectAll('.country')
    .data(countries.features)
    .join('path')
    .attr('class', 'country')
    .attr('d', path);

  // Borders
  g.append('path')
    .datum(topojson.mesh(world, world.objects.countries, (a, b) => a !== b))
    .attr('fill', 'none')
    .attr('stroke', '#b8ad90')
    .attr('stroke-width', 0.4)
    .attr('d', path);

  // Resize handler
  window.addEventListener('resize', () => {
    const W2 = container.clientWidth;
    const H2 = container.clientHeight;
    svg.attr('width', W2).attr('height', H2);
    projection.scale(W2 / 6.2).translate([W2 / 2, H2 / 2]);
    path = d3.geoPath().projection(projection);
    g.selectAll('.country').attr('d', path);
    g.selectAll('.graticule').attr('d', path);
    updateMarkerPositions();
  });
}

function buildMarkers() {
  const tooltip = document.getElementById('tooltip');

  g.selectAll('.marker-group').remove();

  const sorted = [...locations].sort((a, b) => a.year - b.year);

  sorted.forEach(loc => {
    const [x, y] = projection([loc.lng, loc.lat]);

    const group = g.append('g')
      .attr('class', 'marker-group')
      .attr('transform', `translate(${x},${y})`)
      .attr('data-id', loc.id)
      .style('cursor', 'pointer');

    group.append('circle')
      .attr('class', 'marker-dot')
      .attr('r', 3)
      .attr('stroke', '#fff')
      .attr('stroke-width', 1);

    group.append('circle')
      .attr('r', 18)
      .attr('fill', 'transparent')
      .attr('stroke', 'none');

    group
      .on('mouseenter', function(event) {
        tooltip.innerHTML = `
          <span class="tip-year">${loc.year}</span>
          ${loc.name}
        `;
        tooltip.classList.add('visible');
        positionTooltip(event);
      })
      .on('mousemove', positionTooltip)
      .on('mouseleave', function() {
        tooltip.classList.remove('visible');
      })
      .on('click', function(event) {
        event.stopPropagation();
        tooltip.classList.remove('visible');
        openModal(loc);
      });
  });
}

function updateMarkerPositions() {
  g.selectAll('.marker-group').each(function() {
    const id  = +this.dataset.id;
    const loc = locations.find(d => d.id === id);
    if (!loc) return;
    const [x, y] = projection([loc.lng, loc.lat]);
    d3.select(this).attr('transform', `translate(${x},${y})`);
  });
}

function positionTooltip(event) {
  const tooltip  = document.getElementById('tooltip');
  const container = document.getElementById('map-container');
  const rect     = container.getBoundingClientRect();
  const x = event.clientX - rect.left + 12;
  const y = event.clientY - rect.top  - 36;
  tooltip.style.left = x + 'px';
  tooltip.style.top  = y + 'px';
}

// timeline
function buildTimeline() {
  const container = document.getElementById('timeline-dots');
  container.innerHTML = '';

  const sorted = [...locations].sort((a, b) => a.year - b.year);
  const minYear = sorted[0].year;
  const maxYear = sorted[sorted.length - 1].year;
  const span    = maxYear - minYear;

  sorted.forEach(loc => {
    const pct = span === 0 ? 50 : ((loc.year - minYear) / span) * 96 + 2; // 2–98%

    const dot = document.createElement('div');
    dot.className = 'tl-dot';
    dot.style.left = pct + '%';
    dot.title = `${loc.name} (${loc.year})`;
    dot.addEventListener('click', () => {
      flyToLocation(loc);
      openModal(loc);
    });
    container.appendChild(dot);

    // every other year to avoid crowding in labeling
    if (sorted.indexOf(loc) % 2 === 0) {
      const label = document.createElement('div');
      label.className = 'tl-label';
      label.style.left = pct + '%';
      label.textContent = loc.year;
      container.appendChild(label);
    }

    
  });
}


// fly to
function flyToLocation(loc) {
  const container = document.getElementById('map-container');
  const W = container.clientWidth;
  const H = container.clientHeight;

  const [x, y] = projection([loc.lng, loc.lat]);
  const scale   = 3;

  svg.transition()
    .duration(750)
    .call(
      zoom.transform,
      d3.zoomIdentity
        .translate(W / 2, H / 2)
        .scale(scale)
        .translate(-x, -y)
    );
}

// modal
function bindModal() {
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
    if (e.key === 'ArrowRight') nextPhoto();
    if (e.key === 'ArrowLeft')  prevPhoto();
  });

  document.getElementById('next-photo').addEventListener('click', nextPhoto);
  document.getElementById('prev-photo').addEventListener('click', prevPhoto);
}

function openModal(loc) {
  flyToLocation(loc);

  document.getElementById('modal-year').textContent           = loc.year;
  document.getElementById('modal-title').textContent          = loc.name;
  document.getElementById('modal-location-label').textContent = `📍 ${loc.city}`;
  document.getElementById('modal-description').textContent    = loc.description;
  document.getElementById('modal-quote').textContent          = loc.quote || '';

  // Photos
  currentPhotos     = loc.photos || [];
  currentPhotoIndex = 0;
  renderPhoto();

  document.getElementById('modal-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.body.style.overflow = '';
}

function renderPhoto() {
  const photoEl   = document.getElementById('modal-photo');
  const noPhoto   = document.getElementById('no-photo');
  const carousel  = document.getElementById('photo-carousel');
  const nav       = document.getElementById('photo-nav');
  const counter   = document.getElementById('photo-counter');

  if (currentPhotos.length === 0) {
    carousel.style.display = 'none';
    noPhoto.style.display  = 'block';
    return;
  }

  carousel.style.display = 'block';
  noPhoto.style.display  = 'none';
  photoEl.src            = currentPhotos[currentPhotoIndex];
  photoEl.alt            = `Memory photo ${currentPhotoIndex + 1}`;

  if (currentPhotos.length > 1) {
    nav.classList.remove('hidden');
    counter.textContent = `${currentPhotoIndex + 1} / ${currentPhotos.length}`;
  } else {
    nav.classList.add('hidden');
  }
}

function nextPhoto() {
  if (currentPhotos.length < 2) return;
  currentPhotoIndex = (currentPhotoIndex + 1) % currentPhotos.length;
  renderPhoto();
}

function prevPhoto() {
  if (currentPhotos.length < 2) return;
  currentPhotoIndex = (currentPhotoIndex - 1 + currentPhotos.length) % currentPhotos.length;
  renderPhoto();
}

// start
init().catch(err => {
  console.error('Failed to load map data:', err);
  document.getElementById('map-container').innerHTML =
    '<p style="color:#b5451b;padding:2rem;font-family:sans-serif">⚠️ Could not load map. Make sure you\'re running a local server (e.g. <code>npx serve .</code>).</p>';
});