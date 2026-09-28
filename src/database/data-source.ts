import 'dotenv/config';
import { DataSource } from 'typeorm';
import * as entities from './entities';

/**
 * Used by the TypeORM CLI only. The running application builds its own
 * DataSource in DatabaseModule from ConfigService.
 */
export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL ?? 'postgres://expats:expats@localhost:5435/expats',
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities: Object.values(entities),
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
});
