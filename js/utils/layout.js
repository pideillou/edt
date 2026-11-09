/**
 * Répartit des événements qui se chevauchent en colonnes côte à côte.
 * Les événements doivent être triés par début.
 * @param {Array<{start: Date, end: Date}>} events
 * @returns {Array<{event: Object, column: number, columns: number}>}
 */
export function layoutOverlaps(events) {
  const placed = [];
  let cluster = [];
  let clusterEnd = -Infinity;
  let columnsEnd = [];

  const closeCluster = () => {
    const count = columnsEnd.length;
    for (const item of cluster) item.columns = count;
    placed.push(...cluster);
    cluster = [];
    columnsEnd = [];
  };

  for (const event of events) {
    const start = event.start.getTime();
    const end = Math.max(event.end.getTime(), start + 1);
    if (start >= clusterEnd && cluster.length) closeCluster();

    let column = columnsEnd.findIndex((columnEnd) => columnEnd <= start);
    if (column === -1) {
      column = columnsEnd.length;
      columnsEnd.push(end);
    } else {
      columnsEnd[column] = end;
    }
    cluster.push({ event, column, columns: 1 });
    clusterEnd = cluster.length === 1 ? end : Math.max(clusterEnd, end);
  }
  if (cluster.length) closeCluster();
  return placed;
}

/**
 * Teinte stable (0 à 359) pour une matière, pour colorer ses cours.
 * Pas de rouge, d'orange ni de jaune : le rouge est réservé aux cours annulés.
 * @param {string} text
 * @returns {number}
 */
export function hueFor(text) {
  const hues = [210, 150, 230, 280, 185, 95, 255, 125, 300, 195, 165];
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return hues[hash % hues.length];
}
