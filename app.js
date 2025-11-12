// app.js - defensive version to avoid "Cannot read properties of null (reading 'addEventListener')"
// All DOM initialization is inside DOMContentLoaded and we check each important element before use.
// If an element is missing, a descriptive console.error is printed and initialization aborts gracefully.

document.addEventListener('DOMContentLoaded', () => {
  const courseFiles = {
    yamanote: 'course-0-yamanote-shinjuku-shibuya.json',
    tokaido: 'course-tokaido-53-full.json'
  };
  const DEFAULT_STEP_LEN = 0.72;

  // helper to get element and log missing id
  function getEl(selector, type = 'id') {
    const el = type === 'id' ? document.getElementById(selector) : document.querySelector(selector);
    if (!el) {
      console.error(`[app.js] Missing element for selector "${selector}" (type=${type}). Aborting init.`);
    }
    return el;
  }

  // DOM refs (use getEl to detect missing elements early)
  const displayDate = getEl('displayDate');
  const btnY = getEl('btnYamanote');
  const btnT = getEl('btnTokaido');
  const boardSummary = getEl('boardSummary');
  const svg = getEl('boardSvg');
  const historyList = getEl('historyList');
  const inputTbody = document.querySelector('#inputTable tbody');
  const addAllBtn = getEl('addAllBtn');
  const clearTableBtn = getEl('clearTableBtn');

  // If any of the required elements are missing, stop further initialization.
  const required = [
    { name: 'displayDate', el: displayDate },
    { name: 'btnYamanote', el: btnY },
    { name: 'btnTokaido', el: btnT },
    { name: 'boardSummary', el: boardSummary },
    { name: 'boardSvg', el: svg },
    { name: '#inputTable tbody', el: inputTbody, query: true },
    { name: 'historyList', el: historyList },
    { name: 'addAllBtn', el: addAllBtn },
    { name: 'clearTableBtn', el: clearTableBtn }
  ];
  const missing = required.filter(r => !r.el);
  if (missing.length) {
    console.error('[app.js] Initialization aborted. Missing DOM elements:', missing.map(m => m.name));
    // Helpful console hint: print current document body to inspect structure
    console.debug(document.body ? document.body.innerHTML.slice(0, 1200) : 'no body');
    return;
  }

  // map init (we assume Leaflet script/style are loaded)
  const map = L.map('map', { zoomControl: false }).setView([35.2, 137.2], 6);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);
  let stationMarkers = [];
  let playerMarker = null;

  // storage helpers
  const STORAGE_KEY = 'manpo_entries_v1';
  function loadEntries(){ try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : []; } catch(e){ console.error('loadEntries parse error', e); return []; } }
  function saveEntries(entries){ try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); } catch(e){ console.error('saveEntries error', e); } }

  // generate 10 input rows
  function genTableRows(){
    if (!inputTbody) {
      console.error('[app.js] genTableRows aborted: inputTbody missing.');
      return;
    }
    inputTbody.innerHTML = '';
    for (let i=0;i<10;i++){
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="num">${i+1}</td>
        <td><input type="date" class="row-date" /></td>
        <td><input type="number" class="row-steps" min="0" inputmode="numeric" /></td>
        <td>
          <select class="row-source">
            <option value="manual">手入力</option>
            <option value="coca-cola">コカ・コーラ</option>
            <option value="other">その他</option>
          </select>
        </td>
        <td>
          <button class="btn row-add">追加</button>
        </td>
      `;
      inputTbody.appendChild(tr);
    }
    // attach row add events; check existence
    const rowAddBtns = inputTbody.querySelectorAll('.row-add');
    if (!rowAddBtns) {
      console.warn('[app.js] No .row-add buttons found after genTableRows.');
      return;
    }
    rowAddBtns.forEach((btn, idx) => {
      btn.addEventListener('click', (ev) => {
        const row = ev.target.closest('tr');
        const date = row.querySelector('.row-date').value;
        const steps = Number(row.querySelector('.row-steps').value || 0);
        const source = row.querySelector('.row-source').value;
        if (!date){ alert('日付を選択してください'); return; }
        addEntry({ id: Date.now().toString(36), dateIso: date, steps, source });
        // clear steps after add
        row.querySelector('.row-steps').value = '';
      });
    });
  }

  // add entry to storage and refresh UI
  function addEntry(entry){
    const arr = loadEntries();
    arr.push(entry);
    saveEntries(arr);
    renderHistory();
    updateFromInput();
  }

  function renderHistory(){
    const arr = loadEntries().sort((a,b)=> b.dateIso.localeCompare(a.dateIso));
    historyList.innerHTML = '';
    arr.forEach((e, idx) => {
      const el = document.createElement('div');
      el.className = 'history-item';
      el.innerHTML = `<div><strong>${e.dateIso}</strong><div class="meta">${(Number(e.steps)||0).toLocaleString()} steps ・ ${e.source||'manual'}</div></div>
        <div>
          <button class="btn small edit" data-idx="${idx}">編集</button>
          <button class="btn secondary small del" data-idx="${idx}">削除</button>
        </div>`;
      historyList.appendChild(el);
    });
    // events
    historyList.querySelectorAll('.del').forEach(btn=>{
      btn.addEventListener('click', (ev)=>{
        const i = Number(ev.target.dataset.idx);
        const arr = loadEntries();
        arr.splice(i,1);
        saveEntries(arr);
        renderHistory();
        updateFromInput();
      });
    });
    historyList.querySelectorAll('.edit').forEach(btn=>{
      btn.addEventListener('click', (ev)=>{
        const i = Number(ev.target.dataset.idx);
        const arr = loadEntries();
        const e = arr[i];
        if (e){
          // put values into first empty row for quick edit
          const firstRow = document.querySelector('#inputTable tbody tr');
          if (firstRow) {
            firstRow.querySelector('.row-date').value = e.dateIso;
            firstRow.querySelector('.row-steps').value = e.steps;
            firstRow.querySelector('.row-source').value = e.source || 'manual';
          } else {
            console.warn('[app.js] No table rows found to populate edit.');
          }
        }
      });
    });
  }

  // load course JSON (safe guards)
  let currentCourse = null;
  let currentCourseKey = 'yamanote';
  async function loadCourseByKey(key){
    const url = (key === 'yamanote') ? courseFiles.yamanote : courseFiles.tokaido;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const course = await res.json();
      computeBoardPositions(course);
      currentCourse = course;
      currentCourseKey = key;
      btnY.classList.toggle('active', key==='yamanote');
      btnT.classList.toggle('active', key==='tokaido');
      renderCourseOnMap(course);
      renderBoard(course);
      updateFromInput();
    } catch(err){
      console.error('course load failed', err);
      if (boardSummary) boardSummary.textContent = 'コース読み込みに失敗しました: ' + err.message;
    }
  }

  function computeBoardPositions(course){
    const viewW = 1200, pad = 60, usableW = viewW - pad*2;
    const total = course.totalDistanceMeters || (course.stations[course.stations.length-1].cumulativeMeters || (course.stations.length-1));
    if (!course.stations.some(s => typeof s.cumulativeMeters === 'number')) {
      // approximate evenly if cumulative missing
      course.stations.forEach((s,i) => {
        s.cumulativeMeters = Math.round((i / (course.stations.length-1)) * (total || course.stations.length-1));
      });
    }
    course.stations.forEach((s,i)=>{
      s.boardX = pad + ((s.cumulativeMeters || 0) / (total || 1)) * usableW;
      s.boardY = 110 + (i % 2 === 0 ? -12 : 12);
    });
    course.totalDistanceMeters = total;
  }

  function renderBoard(course){
    if (!svg) { console.error('[app.js] renderBoard aborted: svg missing'); return; }
    svg.innerHTML = '';
    svg.innerHTML = `<defs><filter id="dropShadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="6" stdDeviation="10" flood-opacity="0.08"></feDropShadow></filter></defs>`;
    for (let i=1;i<course.stations.length;i++){
      const a = course.stations[i-1], b = course.stations[i];
      const line = document.createElementNS('http://www.w3.org/2000/svg','line');
      line.setAttribute('x1', a.boardX); line.setAttribute('y1', a.boardY);
      line.setAttribute('x2', b.boardX); line.setAttribute('y2', b.boardY);
      line.setAttribute('class','edge');
      svg.appendChild(line);
    }
    course.stations.forEach((s,i)=>{
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
      label.textContent = `${s.name}${s.cumulativeMeters ? ' ・ ' + (s.cumulativeMeters/1000).toFixed(1)+'km' : ''}`;
      g.appendChild(label);
      svg.appendChild(g);
    });
    // player mark
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

  function renderCourseOnMap(course){
    // clear
    stationMarkers.forEach(m=>map.removeLayer(m)); stationMarkers = [];
    if (playerMarker){ map.removeLayer(playerMarker); playerMarker = null; }
    const latlngs = [];
    course.stations.forEach(s => { if (s.lat!=null && s.lon!=null) latlngs.push([s.lat,s.lon]); });
    if (latlngs.length) L.polyline(latlngs, {color:'#2f7cab', weight:4, opacity:0.6}).addTo(map);
    course.stations.forEach(s=>{
      if (s.lat==null || s.lon==null) return;
      const mk = L.circleMarker([s.lat, s.lon], {radius:6, color:'#2f7cab', fillColor:'#fff', weight:2}).addTo(map);
      mk.bindPopup(`${s.name}<br/>累積: ${s.cumulativeMeters ? (s.cumulativeMeters/1000).toFixed(2)+' km':''}`);
      stationMarkers.push(mk);
    });
    if (latlngs.length) map.fitBounds(latlngs, {padding:[40,40]});
  }

  // sum steps up to specified date
  function totalStepsUpTo(dateIso){
    const arr = loadEntries();
    return arr.reduce((acc,e)=> (e.dateIso <= dateIso ? acc + Number(e.steps||0) : acc), 0);
  }

  function updateFromInput(){
    if (!currentCourse) return;
    // take selected date from first row date (quick UI) or fallback to today
    const selRowDateEl = document.querySelector('#inputTable tbody tr .row-date');
    const selDate = selRowDateEl ? selRowDateEl.value : new Date().toISOString().slice(0,10);
    if (displayDate) displayDate.textContent = selDate || '--';
    const totalSteps = totalStepsUpTo(selDate);
    const stepLen = currentCourse.defaultStepLengthMeters || DEFAULT_STEP_LEN;
    const distMeters = totalSteps * stepLen;
    const totalRoute = currentCourse.totalDistanceMeters || (currentCourse.stations[currentCourse.stations.length-1].cumulativeMeters || Infinity);
    const clamped = Math.min(distMeters, totalRoute);

    // find index
    let idx = 0;
    for (let i=0;i<currentCourse.stations.length;i++){
      if ((currentCourse.stations[i].cumulativeMeters||0) <= clamped) idx = i;
      else break;
    }
    const cur = currentCourse.stations[idx];
    const next = currentCourse.stations[Math.min(idx+1, currentCourse.stations.length-1)];
    const between = Math.max(1, (next.cumulativeMeters||0) - (cur.cumulativeMeters||0));
    const progressed = (clamped - (cur.cumulativeMeters||0)) / between;

    // board player update
    const player = document.getElementById('playerMark');
    if (player && cur && next){
      const px = (cur.boardX||0) + ((next.boardX||0) - (cur.boardX||0)) * progressed;
      const py = (cur.boardY||0) + ((next.boardY||0) - (cur.boardY||0)) * progressed;
      player.setAttribute('transform', `translate(${px},${py})`);
    }

    // map player update
    if (playerMarker){ map.removeLayer(playerMarker); playerMarker = null; }
    if (cur && cur.lat!=null && next && next.lat!=null){
      const pLat = cur.lat + (next.lat - cur.lat) * progressed;
      const pLon = cur.lon + (next.lon - cur.lon) * progressed;
      playerMarker = L.circleMarker([pLat,pLon], {radius:10, color:'#f05a28', fillColor:'#fff', weight:2}).addTo(map);
      playerMarker.bindPopup(`位置: ${(clamped/1000).toFixed(2)} km<br/>次: ${next.name}まで ${(((next.cumulativeMeters||0)-clamped)/1000).toFixed(2)} km`);
      playerMarker.openPopup();
    }

    if (boardSummary) {
      boardSummary.innerHTML = `累計歩数（〜${selDate}）: <strong>${totalSteps.toLocaleString()}</strong> steps （${(distMeters/1000).toFixed(2)} km）<br/>
        現在: <strong>${cur.name}</strong> ${(clamped/1000).toFixed(2)} km ・ 次: <strong>${next.name}</strong>まで ${(((next.cumulativeMeters||0)-clamped)/1000).toFixed(2)} km`;
    }
  }

  // events: table buttons -- ensure buttons exist before attaching
  if (addAllBtn) {
    addAllBtn.addEventListener('click', ()=>{
      const rows = Array.from(document.querySelectorAll('#inputTable tbody tr'));
      rows.forEach(row => {
        const date = row.querySelector('.row-date').value;
        const steps = Number(row.querySelector('.row-steps').value || 0);
        const source = row.querySelector('.row-source').value;
        if (date && steps > 0) addEntry({ id: Date.now().toString(36) + Math.random().toString(36).slice(2,6), dateIso: date, steps, source });
      });
    });
  } else {
    console.warn('[app.js] addAllBtn not found; skipping its listener.');
  }

  if (clearTableBtn) {
    clearTableBtn.addEventListener('click', genTableRows);
  } else {
    console.warn('[app.js] clearTableBtn not found; skipping its listener.');
  }

  // course toggles
  if (btnY) btnY.addEventListener('click', ()=> loadCourseByKey('yamanote'));
  if (btnT) btnT.addEventListener('click', ()=> loadCourseByKey('tokaido'));

  // initial setup
  genTableRows();
  renderHistory();
  loadCourseByKey('yamanote').catch(err => console.error('Initial course load failed', err));

  // update position when history changes via storage events (optional)
  window.addEventListener('storage', () => { renderHistory(); updateFromInput(); });
});