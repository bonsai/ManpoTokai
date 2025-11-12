/**
 * compute_distances.js
 * - Node.js script to compute distanceFromPrev, cumulativeMeters, approxSteps for a course JSON.
 * - Usage: node compute_distances.js course-file.json [stepLengthMeters]
 *
 * Notes:
 * - The JSON must contain "stations" array with each station having numeric lat and lon.
 * - If a station has null lat/lon the script will abort and print which station is missing coords.
 * - Output: writes a new file course-file.completed.json with computed fields filled in.
 */

const fs = require('fs');
const path = require('path');

function toRad(v){ return v * Math.PI / 180; }
function haversine(lat1, lon1, lat2, lon2){
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

async function main(){
  const argv = process.argv.slice(2);
  if (argv.length < 1){
    console.error('Usage: node compute_distances.js course-file.json [stepLengthMeters]');
    process.exit(1);
  }
  const file = argv[0];
  const stepLen = Number(argv[1] || 0.72);

  if (!fs.existsSync(file)){
    console.error('File not found:', file);
    process.exit(2);
  }
  const raw = fs.readFileSync(file,'utf8');
  const course = JSON.parse(raw);
  if (!course.stations || !Array.isArray(course.stations)){
    console.error('Invalid course JSON: missing stations array');
    process.exit(3);
  }

  // validate coords
  for (let i=0;i<course.stations.length;i++){
    const s = course.stations[i];
    if (s.lat == null || s.lon == null){
      console.error(`Station ${i} (${s.name}) missing lat/lon. Please fill coordinates before running.`);
      process.exit(4);
    }
  }

  let cum = 0;
  for (let i=0;i<course.stations.length;i++){
    const s = course.stations[i];
    if (i === 0){
      s.distanceFromPrev = 0;
      s.cumulativeMeters = 0;
      s.approxSteps = 0;
      cum = 0;
    } else {
      const prev = course.stations[i-1];
      const d = Math.round(haversine(prev.lat, prev.lon, s.lat, s.lon));
      s.distanceFromPrev = d;
      cum += d;
      s.cumulativeMeters = cum;
      s.approxSteps = Math.round(cum / stepLen);
    }
  }

  // If route is loop and you want to compute last->first, uncomment below to add final leg
  // const last = course.stations[course.stations.length-1];
  // const first = course.stations[0];
  // last.distanceToFirst = Math.round(haversine(last.lat, last.lon, first.lat, first.lon));

  course.totalDistanceMeters = course.stations[course.stations.length-1].cumulativeMeters;
  course.totalApproxSteps = Math.round(course.totalDistanceMeters / stepLen);

  const outPath = path.join(path.dirname(file), path.basename(file, path.extname(file)) + '.completed.json');
  fs.writeFileSync(outPath, JSON.stringify(course, null, 2), 'utf8');
  console.log('Computed distances written to', outPath);
  console.log('Total distance (m):', course.totalDistanceMeters, ' approx steps:', course.totalApproxSteps);
}

main().catch(err => { console.error(err); process.exit(99); });