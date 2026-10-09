import { appSchema, tableSchema } from '@nozbe/watermelondb';

export default appSchema({
  version: 2,
  tables: [
    tableSchema({
      name: 'nodes',
      columns: [
        { name: 'lat', type: 'number' },
        { name: 'long', type: 'number' },
        { name: 'timestamp', type: 'number' },
        { name: 'status', type: 'string' }, // e.g., pending_sync, awaiting_verification, denied
        { name: 'sync_status', type: 'string' }, // pending, synced
        { name: 'description', type: 'string', isOptional: true }, // verifier field notes
      ],
    }),
  ],
});
