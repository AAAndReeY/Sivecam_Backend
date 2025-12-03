import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sql from 'mssql';

@Injectable()
export class SqlService implements OnModuleDestroy {
  private pool: sql.ConnectionPool | null = null;

  constructor(private readonly config: ConfigService) {}

  async connect() {
    if (this.pool) return this.pool;
    this.pool = await new sql.ConnectionPool({
      user: this.config.getOrThrow<string>('SQL_USER'),
      password: this.config.getOrThrow<string>('SQL_PASSWORD'),
      server: this.config.getOrThrow<string>('SQL_HOST'),
      database: this.config.getOrThrow<string>('SQL_DATABASE'),
      port: Number(this.config.getOrThrow<number>('SQL_PORT')),
      options: {
        encrypt: false,
        trustServerCertificate: true,
      },
    }).connect();
    return this.pool;
  }
  async query<T = any>(
    query: string,
    params?: Record<string, any>,
  ): Promise<T[]> {
    const pool = await this.connect();
    const request = pool.request();
    if (params)
      Object.entries(params).forEach(([key, value]) => {
        request.input(key, value);
      });
    const result = await request.query(query);
    return result.recordset;
  }

  async onModuleDestroy() {
    if (!this.pool) return this.pool;
    await this.pool.close();
    this.pool = null;
  }
}
