import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

@Injectable()
export class SqlService implements OnModuleDestroy {
  private pool: Pool | null = null;

  constructor(private readonly config: ConfigService) {}

  private getPool(): Pool {
    if (this.pool) return this.pool;
    this.pool = new Pool({
      connectionString: this.config.getOrThrow<string>('SQL_DATABASE_URL'),
    });
    return this.pool;
  }

  async query<T = any>(
    query: string,
    params?: Record<string, any>,
  ): Promise<T[]> {
    const pool = this.getPool();
    let text = query;
    const values: any[] = [];
    if (params) {
      Object.entries(params).forEach(([key, value], index) => {
        text = text.replace(new RegExp(`@${key}`, 'g'), `$${index + 1}`);
        values.push(value);
      });
    }
    const result = await pool.query(text, values);
    return result.rows as T[];
  }

  async onModuleDestroy() {
    if (!this.pool) return;
    await this.pool.end();
    this.pool = null;
  }
}