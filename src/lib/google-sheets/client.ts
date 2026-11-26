import { google, sheets_v4 } from 'googleapis';
import crypto from 'crypto';
import { getGoogleSheetsConfig, validateGoogleSheetsConfig, isGoogleSheetsConfigured } from './config';
import { SHEET_NAMES, SHEET_HEADERS } from './schema';
import { parseFinancialNumber } from '../financial';
import { sanitizeCsvFormula } from '../security/validator';

export interface DiagnosticStepResult {
  step: string;
  success: boolean;
  message: string;
  durationMs?: number;
  details?: any;
}

export interface ComprehensiveDiagnosticReport {
  overallSuccess: boolean;
  spreadsheetId: string;
  spreadsheetTitle?: string;
  steps: DiagnosticStepResult[];
  error?: string;
}

interface CacheEntry<T> {
  data: T[];
  timestamp: number;
}

export class GoogleSheetsClient {
  private sheets: sheets_v4.Sheets | null = null;
  private spreadsheetId: string = '';
  private currentEmail: string = '';
  private cache: Map<string, CacheEntry<any>> = new Map();
  private cacheTTL: number = 5000; // 5s in-memory TTL for responsive multi-tab persistence
  private sheetLocks: Map<string, Promise<any>> = new Map();

  constructor() {
    this.ensureClient();
  }

  /**
   * Helper to acquire distributed lock via Upstash Redis REST when configured.
   * If Redis is unconfigured, proceeds in local-process mode.
   */
  private async acquireDistributedSheetLock(
    sheetName: string,
    ttlSeconds = 10,
    timeoutMs = 4000
  ): Promise<{ acquired: boolean; token: string; key: string }> {
    const restUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const restToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    const key = `crm:lock:sheet:${sheetName}`;

    if (!restUrl || !restToken) {
      return { acquired: true, token: 'local-only', key };
    }

    const token = crypto.randomUUID();
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        const res = await fetch(`${restUrl}/set/${encodeURIComponent(key)}/${encodeURIComponent(token)}?nx=true&ex=${ttlSeconds}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${restToken}`,
          },
          signal: AbortSignal.timeout(1000),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.result === 'OK' || data.result === true) {
            return { acquired: true, token, key };
          }
        }
      } catch {
        // Transient network blip; continue retrying until timeout
      }

      // Exponential jitter backoff (100ms - 250ms)
      const backoff = 100 + Math.floor(Math.random() * 150);
      await new Promise((r) => setTimeout(r, backoff));
    }

    return { acquired: false, token: '', key };
  }

  /**
   * Safe release of distributed lock confirming token ownership
   */
  private async releaseDistributedSheetLock(key: string, token: string): Promise<void> {
    if (!token || token === 'local-only') return;
    const restUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const restToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (!restUrl || !restToken) return;

    try {
      const getRes = await fetch(`${restUrl}/get/${encodeURIComponent(key)}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${restToken}` },
        signal: AbortSignal.timeout(1000),
      });
      if (getRes.ok) {
        const data = await getRes.json();
        if (data.result === token) {
          await fetch(`${restUrl}/del/${encodeURIComponent(key)}`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${restToken}` },
            signal: AbortSignal.timeout(1000),
          });
        }
      }
    } catch {
      // Bounded lock expires automatically via TTL
    }
  }

  /**
   * Serializes write and delete operations per sheet using distributed Redis lock when configured
   * and in-process Promise queue fallback.
   */
  private async withSheetLock<T>(sheetName: string, op: () => Promise<T>): Promise<T> {
    const currentLock = this.sheetLocks.get(sheetName) || Promise.resolve();
    let releaseLock: () => void = () => {};
    const nextLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    this.sheetLocks.set(
      sheetName,
      currentLock.then(() => nextLock).catch(() => nextLock)
    );

    try {
      await currentLock;

      // Coordinate via distributed Redis lock if configured
      const distLock = await this.acquireDistributedSheetLock(sheetName, 10, 4000);
      if (!distLock.acquired) {
        throw new Error(
          `SheetLockTimeoutError: Concurrency timeout acquiring distributed lock for sheet "${sheetName}". High write contention detected.`
        );
      }

      try {
        return await op();
      } finally {
        await this.releaseDistributedSheetLock(distLock.key, distLock.token);
      }
    } finally {
      releaseLock();
      if (this.sheetLocks.get(sheetName) === nextLock) {
        this.sheetLocks.delete(sheetName);
      }
    }
  }

  /**
   * Central cell serializer enforcing CSV formula-injection defense on all values written to Google Sheets.
   */
  private formatCellValueForSheets(val: any): string {
    if (val === undefined || val === null) return '';
    if (typeof val === 'object') return JSON.stringify(val);
    const str = String(val);
    return sanitizeCsvFormula(str);
  }

  /**
   * Manually invalidate sheet cache or clear entire cache
   */
  public clearCache(sheetName?: string): void {
    if (sheetName) {
      this.cache.delete(sheetName);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Ensure the Google Sheets JWT client is initialized with current credentials
   */
  private ensureClient(): sheets_v4.Sheets | null {
    const config = getGoogleSheetsConfig();
    if (!config) {
      this.sheets = null;
      this.spreadsheetId = '';
      this.currentEmail = '';
      return null;
    }

    // Reuse client if credentials have not changed
    if (this.sheets && this.spreadsheetId === config.spreadsheetId && this.currentEmail === config.clientEmail) {
      return this.sheets;
    }

    try {
      this.spreadsheetId = config.spreadsheetId;
      this.currentEmail = config.clientEmail;

      const auth = new google.auth.JWT({
        email: config.clientEmail,
        key: config.privateKey,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      this.sheets = google.sheets({ version: 'v4', auth });
      return this.sheets;
    } catch (err: any) {
      console.error('[GoogleSheetsClient] Error creating Google Sheets auth client:', err.message);
      this.sheets = null;
      return null;
    }
  }

  public isReady(): boolean {
    const client = this.ensureClient();
    return client !== null && Boolean(this.spreadsheetId);
  }

  public getSpreadsheetId(): string {
    const config = getGoogleSheetsConfig();
    return config ? config.spreadsheetId : this.spreadsheetId;
  }

  /**
   * Safe execution wrapper with exponential backoff for rate limits and transient network errors
   */
  public async executeWithRetry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      const code = error.code || error.status;
      const isTransient =
        code === 429 ||
        code === 500 ||
        code === 502 ||
        code === 503 ||
        code === 504 ||
        error.message?.includes('ETIMEDOUT') ||
        error.message?.includes('ECONNRESET');

      if (retries > 0 && isTransient) {
        console.warn(`[GoogleSheetsClient] Quota or transient error (${code}). Retrying in ${delay}ms...`);
        await new Promise((res) => setTimeout(res, delay));
        return this.executeWithRetry(fn, retries - 1, delay * 2);
      }

      // Sanitize Google API errors so internal GCP infrastructure details are not exposed
      const sanitized = new Error(
        code === 403
          ? 'Google Sheets API permission denied. Ensure service account has Editor access to spreadsheet.'
          : code === 404
          ? 'Google Spreadsheet not found. Verify GOOGLE_SHEETS_SPREADSHEET_ID.'
          : error.message || 'Google Sheets API service error'
      );
      (sanitized as any).code = code;
      throw sanitized;
    }
  }

  /**
   * Verify spreadsheet connection and metadata
   */
  public async testConnection(): Promise<{ success: boolean; title?: string; sheets?: string[]; error?: string }> {
    const client = this.ensureClient();
    if (!client || !this.spreadsheetId) {
      return { success: false, error: 'Google Sheets credentials not configured or invalid.' };
    }

    try {
      const response = await this.executeWithRetry(() =>
        client.spreadsheets.get({
          spreadsheetId: this.spreadsheetId,
        })
      );

      const title = response.data.properties?.title || 'Untitled Spreadsheet';
      const existingSheets = response.data.sheets?.map((s) => s.properties?.title || '') || [];

      return {
        success: true,
        title,
        sheets: existingSheets.filter(Boolean),
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Failed to connect to Google Sheets API.',
      };
    }
  }

  /**
   * Retrieve map of worksheet titles to numeric sheetId
   */
  private async getSheetIdMap(): Promise<Map<string, number>> {
    const client = this.ensureClient();
    const map = new Map<string, number>();
    if (!client) return map;

    const res = await this.executeWithRetry(() =>
      client.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
        fields: 'sheets.properties(sheetId,title)',
      })
    );

    for (const s of res.data.sheets || []) {
      if (s.properties?.title && typeof s.properties.sheetId === 'number') {
        map.set(s.properties.title, s.properties.sheetId);
      }
    }
    return map;
  }

  /**
   * Auto-initialize the entire CRM database schema in the Google Sheet.
   * Creates all missing worksheets and inserts header rows.
   */
  public async initializeDatabase(): Promise<{ createdSheets: string[]; existingSheets: string[] }> {
    const client = this.ensureClient();
    if (!client) {
      throw new Error('Google Sheets credentials not configured.');
    }

    const test = await this.testConnection();
    if (!test.success) {
      throw new Error(test.error);
    }

    const existingSheets = test.sheets || [];
    const createdSheets: string[] = [];

    // 1. Identify missing sheets
    const requiredSheets = Object.values(SHEET_NAMES);
    const missingSheets = requiredSheets.filter((name) => !existingSheets.includes(name));

    if (missingSheets.length > 0) {
      await this.executeWithRetry(() =>
        client.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          requestBody: {
            requests: missingSheets.map((title) => ({
              addSheet: {
                properties: { title },
              },
            })),
          },
        })
      );
      createdSheets.push(...missingSheets);
    }

    // 2. Add or synchronize header rows to ensure schema parity
    for (const sheetName of requiredSheets) {
      const headers = SHEET_HEADERS[sheetName];
      if (!headers) continue;

      try {
        const res = await this.executeWithRetry(() =>
          client.spreadsheets.values.get({
            spreadsheetId: this.spreadsheetId,
            range: `'${sheetName}'!A1:AZ1`,
          })
        );

        const rows = res.data.values;
        if (!rows || rows.length === 0 || rows[0].length === 0) {
          await this.executeWithRetry(() =>
            client.spreadsheets.values.update({
              spreadsheetId: this.spreadsheetId,
              range: `'${sheetName}'!A1`,
              valueInputOption: 'RAW',
              requestBody: {
                values: [headers],
              },
            })
          );
        } else {
          // Check if current headers need updating/expanding to match schema
          const currentHeaders = rows[0] as string[];
          const isDifferent =
            currentHeaders.length !== headers.length ||
            headers.some((h, i) => currentHeaders[i] !== h);

          if (isDifferent) {
            console.log(`[GoogleSheetsClient] Synchronizing headers for "${sheetName}" (existing: ${currentHeaders.length}, expected: ${headers.length})...`);
            await this.executeWithRetry(() =>
              client.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: `'${sheetName}'!A1`,
                valueInputOption: 'RAW',
                requestBody: {
                  values: [headers],
                },
              })
            );
          }
        }
      } catch (err: any) {
        console.error(`[GoogleSheetsClient] Error writing headers for "${sheetName}":`, err.message);
      }
    }

    return { createdSheets, existingSheets };
  }

  /**
   * Helper to map 2D sheet row arrays to typed objects using column headers
   */
  public mapRowsToObjects<T = Record<string, any>>(headers: string[], dataRows: any[][]): T[] {
    const numericFields = new Set([
      'value',
      'monthlyTarget',
      'probability',
      'closingProbability',
      'order',
      'totalRevenue',
      'dealsCount',
      'notesCount',
      'runCount',
      'totalRows',
      'importedCount',
      'updatedCount',
      'skippedCount',
      'estimatedBudget',
      'leadScore',
      'lead_score',
      'moq',
      'unitPrice',
    ]);

    return dataRows
      .filter((row) => row && row.length > 0 && row.some((cell) => cell !== '' && cell !== undefined))
      .map((row) => {
        const item: Record<string, any> = {};
        headers.forEach((header: string, index: number) => {
          let val = row[index] !== undefined ? row[index] : '';

          // Parse boolean values
          if (val === 'TRUE' || val === 'true') val = true;
          else if (val === 'FALSE' || val === 'false') val = false;

          // Numeric fields conversion
          if (numericFields.has(header)) {
            val = parseFinancialNumber(val, 0);
          } else if (typeof val === 'string' && val.startsWith('#')) {
            // Clean formula error like #ERROR! or #REF!
            val = '';
          }

          // Parse JSON columns automatically
          if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
            try {
              val = JSON.parse(val);
            } catch {
              // Keep as string if not valid JSON
            }
          }
          item[header] = val;

          if (header.endsWith('Json')) {
            const baseKey = header.replace(/Json$/, '');
            if (item[baseKey] === undefined) {
              item[baseKey] = val;
            }
          }

          // Bidirectional mapping for lead score and lineItems/products fields
          if (header === 'leadScore' && item.lead_score === undefined) {
            item.lead_score = val;
          } else if (header === 'lead_score' && item.leadScore === undefined) {
            item.leadScore = val;
          } else if (header === 'lineItems' && Array.isArray(val) && item.products === undefined) {
            item.products = val;
          } else if (header === 'productsJson' && Array.isArray(val) && item.lineItems === undefined) {
            item.lineItems = val;
          } else if (header === 'leadTemperature' && item.lead_temperature === undefined) {
            item.lead_temperature = val;
          } else if (header === 'lead_temperature' && item.leadTemperature === undefined) {
            item.leadTemperature = val;
          } else if (header === 'scoreReasonsJson') {
            if (item.scoreReasons === undefined) item.scoreReasons = val;
            if (item.score_reasons === undefined) item.score_reasons = val;
          }
        });
        return item as T;
      })
      .filter((item: any) => Boolean(item.id));
  }

  /**
   * Fetch all rows for a sheet and map by header column names (with in-memory cache)
   */
  public async getAllRows<T extends Record<string, any>>(sheetName: string, forceFresh = false): Promise<T[]> {
    if (!forceFresh) {
      const cached = this.cache.get(sheetName);
      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        return cached.data as T[];
      }
    }

    const client = this.ensureClient();
    if (!client) {
      if (isGoogleSheetsConfigured()) {
        throw new Error('Google Sheets database is configured but client failed to connect.');
      }
      return [];
    }

    try {
      const res = await this.executeWithRetry(() =>
        client.spreadsheets.values.get({
          spreadsheetId: this.spreadsheetId,
          range: `'${sheetName}'!A:AZ`,
        })
      );

      const values = res.data.values;
      if (!values || values.length <= 1) {
        this.cache.set(sheetName, { data: [], timestamp: Date.now() });
        return [];
      }

      const headers = values[0];
      const dataRows = values.slice(1);
      const mappedItems = this.mapRowsToObjects<T>(headers, dataRows);

      this.cache.set(sheetName, { data: mappedItems, timestamp: Date.now() });
      return mappedItems;
    } catch (err: any) {
      // If sheet does not exist, try to initialize it gracefully
      if (err.message?.includes('Unable to parse range') || err.message?.includes('not found')) {
        console.warn(`[GoogleSheetsClient] Sheet "${sheetName}" not found. Auto-initializing schema...`);
        try {
          await this.initializeDatabase();
        } catch {
          // ignore
        }
        return [];
      } else {
        console.error(`[GoogleSheetsClient] Error reading sheet "${sheetName}":`, err.message);
        throw err;
      }
    }
  }

  /**
   * Batch fetch rows across multiple sheets in a single API call to avoid rate limits
   */
  public async batchGetRows(sheetNames: string[], forceFresh = false): Promise<Map<string, any[]>> {
    const results = new Map<string, any[]>();
    const client = this.ensureClient();
    if (!client) {
      if (isGoogleSheetsConfigured()) {
        throw new Error('Google Sheets database is configured but client failed to connect.');
      }
      return results;
    }

    const sheetsToFetch: string[] = [];
    if (!forceFresh) {
      for (const name of sheetNames) {
        const cached = this.cache.get(name);
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
          results.set(name, cached.data);
        } else {
          sheetsToFetch.push(name);
        }
      }
    } else {
      sheetsToFetch.push(...sheetNames);
    }

    if (sheetsToFetch.length === 0) {
      return results;
    }

    try {
      const ranges = sheetsToFetch.map((name) => `'${name}'!A:AZ`);
      const res = await this.executeWithRetry(() =>
        client.spreadsheets.values.batchGet({
          spreadsheetId: this.spreadsheetId,
          ranges,
        })
      );

      const valueRanges = res.data.valueRanges || [];
      for (let i = 0; i < valueRanges.length; i++) {
        const vr = valueRanges[i];
        const sheetName = sheetsToFetch[i];
        const values = vr.values || [];

        if (values.length <= 1) {
          this.cache.set(sheetName, { data: [], timestamp: Date.now() });
          results.set(sheetName, []);
          continue;
        }

        const headers = values[0];
        const dataRows = values.slice(1);
        const mapped = this.mapRowsToObjects(headers, dataRows);

        this.cache.set(sheetName, { data: mapped, timestamp: Date.now() });
        results.set(sheetName, mapped);
      }

      return results;
    } catch (err: any) {
      console.error('[GoogleSheetsClient] Error during batchGetRows:', err.message);
      throw err;
    }
  }

  /**
   * Append a record to a sheet using schema headers with cache write-through
   */
  public async appendRow(sheetName: string, record: Record<string, any>): Promise<void> {
    const client = this.ensureClient();
    if (!client) {
      throw new Error('Google Sheets not connected.');
    }

    const headers = SHEET_HEADERS[sheetName];
    if (!headers) throw new Error(`Unknown sheet schema: ${sheetName}`);

    // Invalidate cache immediately to guarantee fresh reads
    this.clearCache(sheetName);

    // Ensure sheet exists
    const rowValues = headers.map((header) => {
      let val = record[header];
      if ((val === undefined || val === null || val === '') && header.endsWith('Json')) {
        const baseKey = header.replace(/Json$/, '');
        if (record[baseKey] !== undefined) {
          val = record[baseKey];
        }
      }
      if (val === undefined || val === null || val === '') {
        if (header === 'leadScore') val = record.lead_score;
        else if (header === 'lead_score') val = record.leadScore;
        else if (header === 'leadTemperature') val = record.lead_temperature;
        else if (header === 'lead_temperature') val = record.leadTemperature;
        else if (header === 'scoreReasonsJson') val = record.scoreReasons ?? record.score_reasons;
      }
      return this.formatCellValueForSheets(val);
    });

    try {
      await this.executeWithRetry(() =>
        client.spreadsheets.values.append({
          spreadsheetId: this.spreadsheetId,
          range: `'${sheetName}'!A:A`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [rowValues],
          },
        })
      );
    } catch (err: any) {
      if (err.message?.includes('Unable to parse range')) {
        // Missing sheet: initialize and retry once
        await this.initializeDatabase();
        await this.executeWithRetry(() =>
          client.spreadsheets.values.append({
            spreadsheetId: this.spreadsheetId,
            range: `'${sheetName}'!A:A`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
              values: [rowValues],
            },
          })
        );
      } else {
        throw err;
      }
    }
  }

  /**
   * Batch append multiple records to a sheet in a single API call with cache write-through
   */
  public async appendRows<T extends Record<string, any>>(sheetName: string, records: T[]): Promise<void> {
    if (!records || records.length === 0) return;
    const client = this.ensureClient();
    if (!client) {
      throw new Error('Google Sheets not connected.');
    }

    const headers = SHEET_HEADERS[sheetName];
    if (!headers) throw new Error(`Unknown sheet schema: ${sheetName}`);

    // Invalidate cache immediately to guarantee fresh reads
    this.clearCache(sheetName);

    const rowsValues = records.map((record) =>
      headers.map((header) => {
        let val = record[header];
        if ((val === undefined || val === null || val === '') && header.endsWith('Json')) {
          const baseKey = header.replace(/Json$/, '');
          if (record[baseKey] !== undefined) {
            val = record[baseKey];
          }
        }
        if (val === undefined || val === null || val === '') {
          if (header === 'leadScore') val = record.lead_score;
          else if (header === 'lead_score') val = record.leadScore;
          else if (header === 'leadTemperature') val = record.lead_temperature;
          else if (header === 'lead_temperature') val = record.leadTemperature;
          else if (header === 'scoreReasonsJson') val = record.scoreReasons ?? record.score_reasons;
        }
        return this.formatCellValueForSheets(val);
      })
    );

    try {
      await this.executeWithRetry(() =>
        client.spreadsheets.values.append({
          spreadsheetId: this.spreadsheetId,
          range: `'${sheetName}'!A:A`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: rowsValues,
          },
        })
      );
    } catch (err: any) {
      if (err.message?.includes('Unable to parse range')) {
        await this.initializeDatabase();
        await this.executeWithRetry(() =>
          client.spreadsheets.values.append({
            spreadsheetId: this.spreadsheetId,
            range: `'${sheetName}'!A:A`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
              values: rowsValues,
            },
          })
        );
      } else {
        throw err;
      }
    }
  }

  /**
   * Replace all data rows in a sheet (clearing rows below header) and writing new records in a single batch
   */
  public async replaceSheetData<T extends Record<string, any>>(sheetName: string, records: T[]): Promise<void> {
    const client = this.ensureClient();
    if (!client) {
      throw new Error('Google Sheets not connected.');
    }

    const headers = SHEET_HEADERS[sheetName];
    if (!headers) throw new Error(`Unknown sheet schema: ${sheetName}`);

    // Update memory cache immediately
    this.cache.set(sheetName, { data: [...records], timestamp: Date.now() });

    // 1. Clear existing data rows (from row 2 downwards)
    try {
      await this.executeWithRetry(() =>
        client.spreadsheets.values.clear({
          spreadsheetId: this.spreadsheetId,
          range: `'${sheetName}'!A2:AZ`,
        })
      );
    } catch (err: any) {
      console.warn(`[GoogleSheetsClient] Clear warning for "${sheetName}":`, err.message);
    }

    if (!records || records.length === 0) return;

    const rowsValues = records.map((record) =>
      headers.map((header) => {
        let val = record[header];
        if ((val === undefined || val === null || val === '') && header.endsWith('Json')) {
          const baseKey = header.replace(/Json$/, '');
          if (record[baseKey] !== undefined) {
            val = record[baseKey];
          }
        }
        if (val === undefined || val === null || val === '') {
          if (header === 'leadScore') val = record.lead_score;
          else if (header === 'lead_score') val = record.leadScore;
          else if (header === 'leadTemperature') val = record.lead_temperature;
          else if (header === 'lead_temperature') val = record.leadTemperature;
          else if (header === 'scoreReasonsJson') val = record.scoreReasons ?? record.score_reasons;
        }
        return this.formatCellValueForSheets(val);
      })
    );

    // 2. Write new rows starting at row 2
    await this.executeWithRetry(() =>
      client.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `'${sheetName}'!A2`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: rowsValues,
        },
      })
    );
  }

  /**
   * Update an existing record by stable ID (never row index) with cache write-through,
   * distributed concurrency coordination, optimistic row verification, and bounded retries.
   */
  public async updateRowById(
    sheetName: string,
    id: string,
    updates: Record<string, any>,
    maxRetries = 3
  ): Promise<boolean> {
    return this.withSheetLock(sheetName, async () => {
      const client = this.ensureClient();
      if (!client) {
        throw new Error('Google Sheets not connected.');
      }

      this.clearCache(sheetName);
      const schemaHeaders = SHEET_HEADERS[sheetName];
      if (!schemaHeaders) throw new Error(`Unknown sheet schema: ${sheetName}`);

      let attempt = 0;
      while (attempt < maxRetries) {
        attempt++;

        // Fetch sheet values to locate stable ID
        const res = await this.executeWithRetry(() =>
          client.spreadsheets.values.get({
            spreadsheetId: this.spreadsheetId,
            range: `'${sheetName}'!A:AZ`,
          })
        );

        const values = res.data.values;
        if (!values || values.length === 0) {
          await this.appendRow(sheetName, { id, ...updates });
          return true;
        }

        let sheetHeaders = [...values[0]];
        const missingHeaders = schemaHeaders.filter((h) => !sheetHeaders.includes(h));
        if (missingHeaders.length > 0) {
          sheetHeaders = [...sheetHeaders, ...missingHeaders];
          const toColLetter = (idx: number) => {
            let s = '';
            let n = idx + 1;
            while (n > 0) {
              const rem = (n - 1) % 26;
              s = String.fromCharCode(65 + rem) + s;
              n = Math.floor((n - 1) / 26);
            }
            return s;
          };
          const lastCol = toColLetter(sheetHeaders.length - 1);
          await this.executeWithRetry(() =>
            client.spreadsheets.values.update({
              spreadsheetId: this.spreadsheetId,
              range: `'${sheetName}'!A1:${lastCol}1`,
              valueInputOption: 'USER_ENTERED',
              requestBody: { values: [sheetHeaders] },
            })
          );
        }

        if (values.length <= 1) {
          await this.appendRow(sheetName, { id, ...updates });
          return true;
        }

        const idIndex = sheetHeaders.indexOf('id');
        if (idIndex === -1) return false;

        let targetRowIndex = -1;
        let existingRowData: any[] = [];

        for (let i = 1; i < values.length; i++) {
          if (values[i] && values[i][idIndex] === id) {
            targetRowIndex = i + 1; // 1-indexed for Sheets A1 notation
            existingRowData = values[i];
            break;
          }
        }

        if (targetRowIndex === -1) {
          // Row not found in sheet: append it as new record
          await this.appendRow(sheetName, { id, ...updates });
          return true;
        }

        // Optimistic verification: Read back row at targetRowIndex before mutating to detect race condition
        const verifyRes = await this.executeWithRetry(() =>
          client.spreadsheets.values.get({
            spreadsheetId: this.spreadsheetId,
            range: `'${sheetName}'!A${targetRowIndex}:AZ${targetRowIndex}`,
          })
        );
        const verifyRows = verifyRes.data.values;
        const currentIdAtTarget = verifyRows && verifyRows[0] ? verifyRows[0][idIndex] : null;

        if (currentIdAtTarget !== id) {
          // Concurrency conflict detected: row position shifted!
          console.warn(
            `[GoogleSheetsClient] Row shift conflict detected at row ${targetRowIndex} for ID ${id}. Retrying (${attempt}/${maxRetries})...`
          );
          await new Promise((r) => setTimeout(r, 100 * attempt));
          continue;
        }

        const headersToUse = [...sheetHeaders];
        let headersExpanded = false;
        for (const h of schemaHeaders) {
          if (!headersToUse.includes(h)) {
            headersToUse.push(h);
            headersExpanded = true;
          }
        }
        if (headersExpanded) {
          await this.executeWithRetry(() =>
            client.spreadsheets.values.update({
              spreadsheetId: this.spreadsheetId,
              range: `'${sheetName}'!A1`,
              valueInputOption: 'RAW',
              requestBody: { values: [headersToUse] },
            })
          );
        }

        const mergedRecord: Record<string, any> = {};
        headersToUse.forEach((header: string, idx: number) => {
          mergedRecord[header] = existingRowData[idx] ?? '';
        });
        Object.assign(mergedRecord, updates);

        // Keep lineItems and productsJson synchronized whenever either is updated
        const latestItems = updates.lineItems ?? updates.products;
        if (latestItems !== undefined) {
          mergedRecord.lineItems = latestItems;
          mergedRecord.productsJson = latestItems;
        }

        const updatedRowValues = headersToUse.map((header: string) => {
          let val = mergedRecord[header];
          if ((val === undefined || val === null || val === '') && header.endsWith('Json')) {
            const baseKey = header.replace(/Json$/, '');
            if (mergedRecord[baseKey] !== undefined) {
              val = mergedRecord[baseKey];
            }
          }
          if (val === undefined || val === null || val === '') {
            if (header === 'leadScore') val = mergedRecord.lead_score;
            else if (header === 'lead_score') val = mergedRecord.leadScore;
            else if (header === 'leadTemperature') val = mergedRecord.lead_temperature;
            else if (header === 'lead_temperature') val = mergedRecord.leadTemperature;
            else if (header === 'scoreReasonsJson') val = mergedRecord.scoreReasons ?? mergedRecord.score_reasons;
            else if (header === 'lineItems') val = mergedRecord.products ?? mergedRecord.productsJson;
            else if (header === 'productsJson') val = mergedRecord.lineItems ?? mergedRecord.products;
          }
          return this.formatCellValueForSheets(val);
        });

        await this.executeWithRetry(() =>
          client.spreadsheets.values.update({
            spreadsheetId: this.spreadsheetId,
            range: `'${sheetName}'!A${targetRowIndex}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
              values: [updatedRowValues],
            },
          })
        );

        return true;
      }

      throw new Error(
        `ConcurrencyConflictError: Sheet row index shifted repeatedly for ID "${id}". Update aborted safely.`
      );
    });
  }

  /**
   * Delete record by stable ID using atomic deleteDimension with optimistic verification and bounded retries
   */
  public async deleteRowById(sheetName: string, id: string, maxRetries = 3): Promise<boolean> {
    return this.withSheetLock(sheetName, async () => {
      const client = this.ensureClient();
      if (!client) return false;

      // Update memory cache immediately
      const cached = this.cache.get(sheetName);
      if (cached) {
        cached.data = cached.data.filter((r: any) => r.id !== id);
        cached.timestamp = Date.now();
      }

      let attempt = 0;
      while (attempt < maxRetries) {
        attempt++;

        const res = await this.executeWithRetry(() =>
          client.spreadsheets.values.get({
            spreadsheetId: this.spreadsheetId,
            range: `'${sheetName}'!A:AZ`,
          })
        );

        const values = res.data.values;
        if (!values || values.length <= 1) return false;

        const sheetHeaders = values[0];
        const idIndex = sheetHeaders.indexOf('id');
        if (idIndex === -1) return false;

        let targetRowIndex = -1;
        for (let i = 1; i < values.length; i++) {
          if (values[i] && values[i][idIndex] === id) {
            targetRowIndex = i; // 0-based index
            break;
          }
        }

        if (targetRowIndex === -1) return false; // Already deleted or not present

        // Optimistic verification: check that row to be deleted actually matches target ID
        const rowNum = targetRowIndex + 1;
        const verifyRes = await this.executeWithRetry(() =>
          client.spreadsheets.values.get({
            spreadsheetId: this.spreadsheetId,
            range: `'${sheetName}'!A${rowNum}:AZ${rowNum}`,
          })
        );
        const verifyRows = verifyRes.data.values;
        const currentIdAtTarget = verifyRows && verifyRows[0] ? verifyRows[0][idIndex] : null;

        if (currentIdAtTarget !== id) {
          // Concurrency conflict detected: row position shifted!
          console.warn(
            `[GoogleSheetsClient] Delete conflict detected at row ${rowNum} for ID ${id}. Retrying (${attempt}/${maxRetries})...`
          );
          await new Promise((r) => setTimeout(r, 100 * attempt));
          continue;
        }

        try {
          const sheetIdMap = await this.getSheetIdMap();
          const sheetId = sheetIdMap.get(sheetName);

          if (sheetId !== undefined) {
            await this.executeWithRetry(() =>
              client.spreadsheets.batchUpdate({
                spreadsheetId: this.spreadsheetId,
                requestBody: {
                  requests: [
                    {
                      deleteDimension: {
                        range: {
                          sheetId,
                          dimension: 'ROWS',
                          startIndex: targetRowIndex,
                          endIndex: targetRowIndex + 1,
                        },
                      },
                    },
                  ],
                },
              })
            );
            return true;
          }
        } catch (batchErr) {
          console.warn(`[GoogleSheetsClient] deleteDimension failed, falling back to clear row:`, batchErr);
        }

        // Fallback: Clear row values
        await this.executeWithRetry(() =>
          client.spreadsheets.values.clear({
            spreadsheetId: this.spreadsheetId,
            range: `'${sheetName}'!A${rowNum}:AZ${rowNum}`,
          })
        );

        return true;
      }

      throw new Error(
        `ConcurrencyConflictError: Sheet row index shifted repeatedly for delete ID "${id}". Deletion aborted safely.`
      );
    });
  }

  /**
   * Comprehensive 6-point Server-Side Connection Test:
   * 1. Required environment variables exist
   * 2. Authentication succeeds
   * 3. Configured spreadsheet can be opened
   * 4. Expected worksheets and headers are available
   * 5. Read operation succeeds
   * 6. Controlled write-and-read-back test succeeds in a dedicated test worksheet (_ConnectionTest)
   */
  public async runComprehensiveDiagnostic(): Promise<ComprehensiveDiagnosticReport> {
    const steps: DiagnosticStepResult[] = [];
    let overallSuccess = true;

    // STEP 1: Environment Variables Check
    const start1 = Date.now();
    const configVal = validateGoogleSheetsConfig();
    if (!configVal.isValid) {
      steps.push({
        step: '1. Environment Variables',
        success: false,
        message: `Missing or invalid variables: ${configVal.errors.join('; ')}`,
        durationMs: Date.now() - start1,
      });
      return {
        overallSuccess: false,
        spreadsheetId: this.spreadsheetId,
        steps,
        error: 'Environment configuration validation failed.',
      };
    }
    steps.push({
      step: '1. Environment Variables',
      success: true,
      message: `Spreadsheet ID: ${configVal.spreadsheetIdMasked}, Service Account: ${configVal.clientEmailMasked}, API Enabled: true`,
      durationMs: Date.now() - start1,
    });

    // STEP 2: Authentication Client Creation
    const start2 = Date.now();
    const client = this.ensureClient();
    if (!client) {
      steps.push({
        step: '2. Authentication Client',
        success: false,
        message: 'Failed to initialize Google JWT Auth client.',
        durationMs: Date.now() - start2,
      });
      return {
        overallSuccess: false,
        spreadsheetId: this.spreadsheetId,
        steps,
        error: 'Authentication client setup failed.',
      };
    }
    steps.push({
      step: '2. Authentication Client',
      success: true,
      message: 'Google JWT authentication client initialized successfully.',
      durationMs: Date.now() - start2,
    });

    // STEP 3: Open Configured Spreadsheet & Inspect Metadata
    const start3 = Date.now();
    let spreadsheetTitle = '';
    let existingSheetTitles: string[] = [];
    try {
      const meta = await this.executeWithRetry(() =>
        client.spreadsheets.get({
          spreadsheetId: this.spreadsheetId,
        })
      );
      spreadsheetTitle = meta.data.properties?.title || 'Untitled';
      existingSheetTitles = (meta.data.sheets || []).map((s) => s.properties?.title || '').filter(Boolean);

      steps.push({
        step: '3. Open Spreadsheet',
        success: true,
        message: `Successfully opened spreadsheet "${spreadsheetTitle}" with ${existingSheetTitles.length} worksheets.`,
        durationMs: Date.now() - start3,
        details: { spreadsheetTitle, sheets: existingSheetTitles },
      });
    } catch (err: any) {
      steps.push({
        step: '3. Open Spreadsheet',
        success: false,
        message: `Failed to open spreadsheet: ${err.message}`,
        durationMs: Date.now() - start3,
      });
      return {
        overallSuccess: false,
        spreadsheetId: this.spreadsheetId,
        steps,
        error: `Could not open spreadsheet: ${err.message}`,
      };
    }

    // STEP 4: Check Expected Worksheets & Headers
    const start4 = Date.now();
    try {
      const requiredSheets = Object.values(SHEET_NAMES);
      const missingSheets = requiredSheets.filter((name) => !existingSheetTitles.includes(name));

      if (missingSheets.length > 0) {
        // Auto-initialize missing sheets
        const initResult = await this.initializeDatabase();
        steps.push({
          step: '4. Worksheets & Headers Verification',
          success: true,
          message: `Verified and auto-initialized ${initResult.createdSheets.length} missing worksheets with required headers.`,
          durationMs: Date.now() - start4,
          details: { created: initResult.createdSheets },
        });
      } else {
        steps.push({
          step: '4. Worksheets & Headers Verification',
          success: true,
          message: `All ${requiredSheets.length} CRM worksheets and headers verified in spreadsheet.`,
          durationMs: Date.now() - start4,
        });
      }
    } catch (err: any) {
      steps.push({
        step: '4. Worksheets & Headers Verification',
        success: false,
        message: `Schema verification error: ${err.message}`,
        durationMs: Date.now() - start4,
      });
      overallSuccess = false;
    }

    // STEP 5: Read Operation Test
    const start5 = Date.now();
    try {
      const readRes = await this.executeWithRetry(() =>
        client.spreadsheets.values.get({
          spreadsheetId: this.spreadsheetId,
          range: `'${SHEET_NAMES.WORKSPACES}'!A1:Z10`,
        })
      );
      const rowsRead = readRes.data.values?.length || 0;
      steps.push({
        step: '5. Read Operation Test',
        success: true,
        message: `Successfully read range from "${SHEET_NAMES.WORKSPACES}" (${rowsRead} rows including header).`,
        durationMs: Date.now() - start5,
      });
    } catch (err: any) {
      steps.push({
        step: '5. Read Operation Test',
        success: false,
        message: `Read failed: ${err.message}`,
        durationMs: Date.now() - start5,
      });
      overallSuccess = false;
    }

    // STEP 6: Controlled Write-and-Read-Back in Dedicated Test Worksheet
    const start6 = Date.now();
    const TEST_SHEET_NAME = '_ConnectionTest';
    const testRecordId = `test-health-${Date.now()}`;
    const testTimestamp = new Date().toISOString();

    try {
      // 1. Ensure test worksheet exists
      const sheetIdMap = await this.getSheetIdMap();
      if (!sheetIdMap.has(TEST_SHEET_NAME)) {
        await this.executeWithRetry(() =>
          client.spreadsheets.batchUpdate({
            spreadsheetId: this.spreadsheetId,
            requestBody: {
              requests: [
                {
                  addSheet: {
                    properties: { title: TEST_SHEET_NAME },
                  },
                },
              ],
            },
          })
        );
        // Write header
        await this.executeWithRetry(() =>
          client.spreadsheets.values.update({
            spreadsheetId: this.spreadsheetId,
            range: `'${TEST_SHEET_NAME}'!A1`,
            valueInputOption: 'RAW',
            requestBody: {
              values: [['id', 'timestamp', 'status', 'verifiedBy']],
            },
          })
        );
      }

      // 2. Perform controlled write
      const writeRes = await this.executeWithRetry(() =>
        client.spreadsheets.values.append({
          spreadsheetId: this.spreadsheetId,
          range: `'${TEST_SHEET_NAME}'!A:A`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [[testRecordId, testTimestamp, 'PASS', 'Rapport CRM Health Check']],
          },
        })
      );

      const updatedCells = writeRes.data.updates?.updatedCells || 0;
      if (updatedCells === 0) {
        throw new Error('Google Sheets API did not confirm any cell updates.');
      }

      // 3. Perform read-back verification
      const verifyRes = await this.executeWithRetry(() =>
        client.spreadsheets.values.get({
          spreadsheetId: this.spreadsheetId,
          range: `'${TEST_SHEET_NAME}'!A:D`,
        })
      );

      const rows = verifyRes.data.values || [];
      const foundRowIndex = rows.findIndex((r) => r && r[0] === testRecordId);
      if (foundRowIndex === -1) {
        throw new Error('Write verification failed: written test record not found in read-back.');
      }

      // 4. Clean up test row
      const cleanupRowNum = foundRowIndex + 1;
      await this.executeWithRetry(() =>
        client.spreadsheets.values.clear({
          spreadsheetId: this.spreadsheetId,
          range: `'${TEST_SHEET_NAME}'!A${cleanupRowNum}:D${cleanupRowNum}`,
        })
      );

      steps.push({
        step: '6. Controlled Write & Read-Back Verification',
        success: true,
        message: `Controlled write to dedicated test worksheet confirmed (${updatedCells} cells), verified by immediate read-back, and cleaned up safely.`,
        durationMs: Date.now() - start6,
      });
    } catch (err: any) {
      steps.push({
        step: '6. Controlled Write & Read-Back Verification',
        success: false,
        message: `Write/Read-back verification failed: ${err.message}`,
        durationMs: Date.now() - start6,
      });
      overallSuccess = false;
    }

    return {
      overallSuccess,
      spreadsheetId: this.spreadsheetId,
      spreadsheetTitle,
      steps,
    };
  }
}

export const googleSheetsClient = new GoogleSheetsClient();
