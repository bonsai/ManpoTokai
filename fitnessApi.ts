/* Google Fitness REST helpers (TypeScript)
   - getStepsAggregate: aggregate step_count.delta between start/end
   - parseAggregateSteps: parse response
   - convenience function: getStepsForDay
*/

export async function getStepsAggregate(accessToken: string, startMs: number, endMs: number) {
  const url = 'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate';
  const body = {
    aggregateBy: [
      { dataTypeName: 'com.google.step_count.delta' }
    ],
    // optional: bucketByTime with durationMillis to split by day, or omit to get one bucket
    bucketByTime: { durationMillis: endMs - startMs },
    startTimeMillis: startMs.toString(),
    endTimeMillis: endMs.toString()
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Fitness API error: ${res.status} ${txt}`);
  }
  const json = await res.json();
  return json;
}

/**
 * Parse aggregate response and return total steps (int)
 */
export function parseAggregateSteps(aggregateResponse: any) {
  let total = 0;
  if (!aggregateResponse) return 0;
  const buckets = aggregateResponse.bucket;
  if (!Array.isArray(buckets)) return 0;
  for (const bucket of buckets) {
    if (!bucket.dataset) continue;
    for (const ds of bucket.dataset) {
      if (!ds.point) continue;
      for (const p of ds.point) {
        if (!p.value) continue;
        for (const v of p.value) {
          if (typeof v.intVal === 'number') total += v.intVal;
          else if (typeof v.fpVal === 'number') total += Math.round(v.fpVal);
        }
      }
    }
  }
  return total;
}

/**
 * Convenience: get steps for a single day (00:00 - 23:59 local)
 */
export async function getStepsForLocalDay(accessToken: string, year: number, month: number, day: number, tzOffsetMinutes = (new Date()).getTimezoneOffset()) {
  // month: 1..12
  const start = new Date(Date.UTC(year, month - 1, day));
  // adjust for local timezone
  const startMs = start.getTime() - (tzOffsetMinutes * 60 * 1000);
  const endMs = startMs + 24 * 3600 * 1000;
  const resp = await getStepsAggregate(accessToken, startMs, endMs);
  return parseAggregateSteps(resp);
}