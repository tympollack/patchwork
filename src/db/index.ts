import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import schema from './schema';
import Node from './models/Node';

const adapter = new SQLiteAdapter({ schema });

export const database = new Database({
  adapter,
  modelClasses: [Node],
});
