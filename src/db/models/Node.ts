import { Model } from '@nozbe/watermelondb';
import { field, date, writer } from '@nozbe/watermelondb/decorators';

export default class Node extends Model {
  static table = 'nodes';

  @field('lat') lat!: number;
  @field('long') long!: number;
  @date('timestamp') timestamp!: number;
  @field('status') status!: string;
  @field('sync_status') nodeSyncStatus!: string;
  @field('description') description!: string | null;

  @writer async markSynced() {
    await this.update((n: any) => {
      n.nodeSyncStatus = 'synced';
    });
  }

  @writer async updateDescription(newDescription: string) {
    await this.update((n: any) => {
      n.description = newDescription;
    });
  }
}
