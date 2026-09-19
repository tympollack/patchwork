import { database } from '../db';
import Node from '../db/models/Node';

export async function seedDatabase() {
  try {
    console.log('Starting database seed...');
    
    // Clear existing data to ensure fresh seed with new schema
    const existingNodes = await database.get('nodes').query().fetch();
    console.log('Found', existingNodes.length, 'existing nodes');
    
    if (existingNodes.length > 0) {
      await database.write(async () => {
        for (const node of existingNodes) {
          await node.destroyPermanently();
        }
      });
      console.log('Cleared existing nodes');
    }

    // Center point (Cincinnati)
    const CENTER_LAT = 39.0501;
    const CENTER_LNG = -84.1915;
    const RADIUS_MILES = 5;

    // Helper to generate random coordinates within a radius
    function getRandomLocation(centerLat: number, centerLng: number, radius: number) {
      const y0 = centerLat;
      const x0 = centerLng;
      const rd = radius / 69; // ~69 miles per degree
      const u = Math.random();
      const v = Math.random();
      const w = rd * Math.sqrt(u);
      const t = 2 * Math.PI * v;
      const x = w * Math.cos(t);
      const y = w * Math.sin(t);
      return { lat: y + y0, lng: x + x0 };
    }

    const statuses = ['pending', 'awaiting_verification', 'verified', 'denied'];
    const syncStatuses = ['pending_sync', 'synced'];
    const descriptions = [
      'Infrastructure damage observed',
      'Pothole on main road',
      'Street light malfunction',
      'Water main leak reported',
      'Traffic signal issue',
      'Sidewalk damage',
      'Signage missing',
      'Drainage blockage',
      'Utility pole damage',
      'Road surface degradation',
    ];

    console.log('Creating 50 mock nodes...');
    const nodesCollection = database.get('nodes');
    const preparedNodes = Array.from({ length: 50 }, () => {
      const loc = getRandomLocation(CENTER_LAT, CENTER_LNG, RADIUS_MILES);
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const syncStatus = syncStatuses[Math.floor(Math.random() * syncStatuses.length)];
      const description = Math.random() > 0.3 ? descriptions[Math.floor(Math.random() * descriptions.length)] : null;
      return nodesCollection.prepareCreate((node) => {
        const nodeModel = node as Node;
        nodeModel.lat = loc.lat;
        nodeModel.long = loc.lng;
        nodeModel.timestamp = Date.now() - Math.floor(Math.random() * 10000000000);
        nodeModel.status = status;
        nodeModel.nodeSyncStatus = syncStatus;
        nodeModel.description = description;
      });
    });
    await database.write(async () => {
      await database.batch(...preparedNodes);
    });

    console.log('Database seeded with 50 mock nodes');
  } catch (error) {
    console.error('Error seeding database:', error);
    throw error;
  }
}
