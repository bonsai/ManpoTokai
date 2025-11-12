// ミニページ: course JSON を読み込み、地図 + すごろくボードに描画。
// 手入力の合計歩数でプレイヤー位置を反映。

(async function(){
  // util: haversine (m)
  function haversine(lat1, lon1, lat2, lon2){
    const toRad = v => v * Math.PI / 180;
    const R = 6371000;
    const dLat = toRad(lat2-lat1);
    const dLon = toRad(lon2-lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  const courseSelect = document.getElementById('courseSelect');
  const loadBtn = document.getElementById('loadBtn');
  const stepsInput = document.getElementById('stepsInput');
  const stepLengthIn = document.getElementById('stepLength');
  const summary = document.getElementById('summary');
  const stationListEl = document.getElementById('stationList');
  const svg = document.getElementById('boardSvg');

  // Leaflet map
  const map = L.map('map', {zoomControl:false}).setView([35.2, 137.2], 6);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);

  let currentCourse = null;
  let stationMarkers = [];
  let playerMarker = null;

  async function loadCourse(url){
    const res = await fetch(url);
    const course = await res.json();
    // ensure distances: if cumulativeMeters not provided, compute using haversine
    let cum = 0;
    for (let i=0;i<course.stations.length;i++){
      const s = course.stations[i];
      if (i===0){
        s.distanceFromPrev = s.distanceFromPrev || 0;
        s.cumulativeMeters = s.cumulativeMeters || 0;
        cum = s.cumulativeMeters || 0;
      } else {
        if (!s.distanceFromPrev || s.distanceFromPrev <= 0){
          const prev = course.stations[i-1];
          s.distanceFromPrev = Math.round(haversine(prev.lat, prev.lon, s.lat, s.lon));
        }
        cum += s.distanceFromPrev;
        s.cumulativeMeters = s.cumulativeMeters || cum;
      }
      // approxSteps for display (based on default step length or course override)
      const stepLen = course.defaultStepLengthMeters || 0.72;
      s.approxSteps = Math.round(s.cumulativeMeters / stepLen);
    }
    // ensure totalDistanceMeters
    course.totalDistanceMeters = course.totalDistanceMeters || course.stations[course.stations.length-1].cumulativeMeters;
    return course;
  }

  function clearMap(){
    stationMarkers.forEach(m => map.removeLayer(m));
    stationMarkers = [];
    if (playerMarker){ map.removeLayer(playerMarker); playerMarker = null; }
  }

  function renderCourse(course){
    clearMap();
    currentCourse = course;
    const latlngs = course.stations.map(s => [s.lat, s.lon]);
    L.polyline(latlngs, {color: '#2f7cab', weight:4, opacity:0.6}).addTo(map);

    course.stations.forEach(s => {
      const marker = L.circleMarker([s.lat, s.lon], {radius:8, color:'#2f7cab', fillColor:'#fff', weight:2}).addTo(map);
      marker.bindPopup(`<strong>${s.name}</strong><br/>累積: ${(s.cumulativeMeters/1000).toFixed(2)} km<br/>区間: ${s.distanceFromPrev? (s.distanceFromPrev/1000).toFixed(2)+' km':''}`);
      stationMarkers.push(marker);
    });

    map.fitBounds(latlngs, {padding:[40,40]});
    renderStationList(course);
    renderBoard(course);
  }

  function renderStationList(course){
    stationListEl.innerHTML = '';
    course.stations.forEach((s, idx) => {
      const el = document.createElement('div');
      el.className = 'station-item';
      const km = (s.cumulativeMeters/1000).toFixed(2);
      const neededSteps = s.approxSteps.toLocaleString();
      el.innerHTML = `<div>
          <div><strong>${idx+1}. ${s.name}</strong></div>
          <div class="meta">${km} km ・ ${neededSteps} steps</div>
        </div>
        <div class="meta">${s.distanceFromPrev ? (s.distanceFromPrev/1000).toFixed(2)+' km' : ''}</div>`;
      stationListEl.appendChild(el);
    });
  }

  function renderBoard(course){
    const viewW = 1200, viewH = 220;
    svg.setAttribute('viewBox', `0 0 ${viewW} ${viewH}`);
    svg.innerHTML = `
      <defs>
        <filter id="dropShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="6" stdDeviation="10" flood-opacity="0.08"></feDropShadow>
        </filter>
      </defs>
    `;

    const pad = 60;
    const usableW = viewW - pad*2;
    const total = course.totalDistanceMeters || course.stations[course.stations.length-1].cumulativeMeters || 1;
    course.stations.forEach((s,i) => {
      s.boardX = pad + (s.cumulativeMeters / total) * usableW;
      s.boardY = viewH/2 + (i % 2 === 0 ? -12 : 12);
    });

    // edges
    for (let i=1;i<course.stations.length;i++){
      const a = course.stations[i-1], b = course.stations[i];
      const line = document.createElementNS('http://www.w3.org/2000/svg','line');
      line.setAttribute('x1', a.boardX); line.setAttribute('y1', a.boardY);
      line.setAttribute('x2', b.boardX); line.setAttribute('y2', b.boardY);
      line.setAttribute('class','edge');
      svg.appendChild(line);
    }

    // nodes
    course.stations.forEach((s,i) => {
      const g = document.createElementNS('http://www.w3.org/2000/svg','g');
      g.setAttribute('transform', `translate(${s.boardX},${s.boardY})`);
      const c = document.createElementNS('http://www.w3.org/2000/svg','circle');
      c.setAttribute('r','18'); c.setAttribute('class','node-circle');
      g.appendChild(c);
      const inner = document.createElementNS('http://www.w3.org/2000/svg','circle');
      inner.setAttribute('r','6'); inner.setAttribute('fill', i===0? '#2f7cab': '#fff');
      inner.setAttribute('stroke','#2f7cab'); inner.setAttribute('stroke-width','1.5');
      g.appendChild(inner);
      const label = document.createElementNS('http://www.w3.org/2000/svg','text');
      label.setAttribute('y','40'); label.setAttribute('text-anchor','middle'); label.setAttribute('class','node-label');
      label.textContent = `${s.name} ・ ${(s.cumulativeMeters/1000).toFixed(1)}km`;
      g.appendChild(label);
      svg.appendChild(g);
    });

    // player group
    const player = document.createElementNS('http://www.w3.org/2000/svg','g');
    player.setAttribute('id','playerMark');
    const pm = document.createElementNS('http://www.w3.org/2000/svg','circle');
    pm.setAttribute('r','10'); pm.setAttribute('class','player-mark');
    player.appendChild(pm);
    const pLabel = document.createElementNS('http://www.w3.org/2000/svg','text');
    pLabel.setAttribute('y','-28'); pLabel.setAttribute('text-anchor','middle'); pLabel.setAttribute('class','node-label');
    pLabel.textContent = 'あなた';
    player.appendChild(pLabel);
    svg.appendChild(player);
  }

  function updateFromInput(){
    if (!currentCourse) return;
    const totalSteps = Math.max(0, Number(stepsInput.value) || 0);
    const stepLen = Math.max(0.2, Number(stepLengthIn.value) || currentCourse.defaultStepLengthMeters || 0.72);
    const distMeters = totalSteps * stepLen;
    const clamped = Math.min(distMeters, currentCourse.totalDistanceMeters);

    // find current station index
    let idx = 0;
    for (let i=0;i<currentCourse.stations.length;i++){
      if (clamped >= currentCourse.stations[i].cumulativeMeters) idx = i;
      else break;
    }
    const cur = currentCourse.stations[idx];
    const next = currentCourse.stations[Math.min(idx+1, currentCourse.stations.length-1)];
    const between = Math.max(1, next.cumulativeMeters - cur.cumulativeMeters);
    const progressed = (clamped - cur.cumulativeMeters) / between;

    // board pos
    const px = cur.boardX + (next.boardX - cur.boardX) * progressed;
    const py = cur.boardY + (next.boardY - cur.boardY) * progressed;
    const player = document.getElementById('playerMark');
    if (player) player.setAttribute('transform', `translate(${px},${py})`);

    // map player marker
    if (playerMarker){ map.removeLayer(playerMarker); playerMarker = null; }
    const pLat = cur.lat + (next.lat - cur.lat) * progressed;
    const pLon = cur.lon + (next.lon - cur.lon) * progressed;
    playerMarker = L.circleMarker([pLat,pLon], {radius:10, color:'#f05a28', fillColor:'#fff', weight:2}).addTo(map);
    playerMarker.bindPopup(`位置: ${(clamped/1000).toFixed(2)} km<br/>次: ${next.name}まで ${(next.cumulativeMeters - clamped)/1000 .toFixed(2)} km`);

    // summary
    summary.innerHTML = `<strong>合計歩数：</strong> ${totalSteps.toLocaleString()} steps (${(distMeters/1000).toFixed(2)} km)<br/>
      <strong>現在：</strong> ${cur.name} ${(clamped/1000).toFixed(2)} km （次へ ${(next.cumulativeMeters - clamped)/1000 .toFixed(2)} km）`;

    // highlight station list
    document.querySelectorAll('.station-item').forEach((el, i) => {
      el.style.opacity = (i <= idx+1) ? '1' : '0.6';
      el.style.background = (i === idx) ? 'linear-gradient(90deg,#eef8ff,#fbfdff)' : '';
    });

    // open popup
    playerMarker.openPopup();
  }

  // event handlers
  loadBtn.addEventListener('click', async () => {
    const url = courseSelect.value;
    try {
      const course = await loadCourse(url);
      renderCourse(course);
      // initial reflect with current inputs
      updateFromInput();
    } catch (err) {
      summary.textContent = 'コース読み込みに失敗しました: ' + err.message;
    }
  });

  stepsInput.addEventListener('input', updateFromInput);
  stepLengthIn.addEventListener('input', updateFromInput);

  // auto-load default selected
  document.getElementById('loadBtn').click();

})();