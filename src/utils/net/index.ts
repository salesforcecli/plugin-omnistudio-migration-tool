/* eslint-disable */
import { Connection } from '@salesforce/core';
import chunk = require('lodash.chunk');
import { UploadRecordResult } from '../../migration/interfaces';
import { Logger } from '../logger';

class NetUtils {
  private static readonly CHUNK_SIZE = 200;

  /**
   * Salesforce REST errors carry the useful detail (which field was rejected, the
   * error code, the human-readable message) on the thrown error object, not in its
   * `.message` (which is often just "Bad Request"). This flattens whatever shape the
   * error arrives in into an array of readable strings so callers/reports can show the
   * real cause instead of a bare "ERROR_HTTP_400".
   */
  public static extractErrorMessages(err: any): string[] {
    if (err == null) return ['Unknown error'];

    // Salesforce REST responses are frequently an array of { message, errorCode, fields }.
    const fromRecord = (rec: any): string | undefined => {
      if (rec == null || typeof rec !== 'object') return undefined;
      const code = rec.errorCode ?? rec.statusCode;
      const message = rec.message;
      const fields = Array.isArray(rec.fields) && rec.fields.length > 0 ? ` [fields: ${rec.fields.join(', ')}]` : '';
      if (code || message) {
        return `${code ? code + ': ' : ''}${message ?? ''}${fields}`.trim();
      }
      return undefined;
    };

    // Parse a value that may already be an object/array, or a JSON string carrying the
    // structured Salesforce error body (jsforce often leaves the raw body on err.content).
    const coerce = (val: any): any => {
      if (typeof val !== 'string') return val;
      const trimmed = val.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          return JSON.parse(trimmed);
        } catch {
          return val;
        }
      }
      return val;
    };

    // The detailed body can live in several places depending on how deep in the stack the
    // error was thrown. Low-level connection.request() (what NetUtils uses) tends to leave
    // it on err.content / err.body; higher-level calls use err.data / err.response.data.
    const candidates = [err?.data, err?.response?.data, err?.content, err?.body, err].map(coerce);

    for (const body of candidates) {
      if (Array.isArray(body)) {
        const msgs = body.map(fromRecord).filter((m): m is string => Boolean(m));
        if (msgs.length > 0) return msgs;
      }
      const single = fromRecord(body);
      if (single) return [single];
    }

    if (typeof err === 'string') return [err];

    // Last resort: combine the generic code/message (e.g. "ERROR_HTTP_400: Bad Request")
    // with any raw content so we never silently drop diagnostic detail.
    const code = err?.errorCode ?? err?.name;
    const base = `${code && code !== 'Error' ? code + ': ' : ''}${err?.message ?? ''}`.trim();
    const raw = err?.content ?? err?.body;
    const rawStr = raw != null ? (typeof raw === 'string' ? raw : this.safeStringify(raw)) : '';
    const combined = [base, rawStr].filter(Boolean).join(' | ');
    if (combined) return [combined];

    return [this.safeStringify(err)];
  }

  private static safeStringify(val: any): string {
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }

  public static async create(
    connection: Connection,
    objectName: string,
    data: any[]
  ): Promise<Map<string, UploadRecordResult>> {
    // Metadata API only accepts 200 records per request
    const chunks = chunk(data, NetUtils.CHUNK_SIZE),
      results = new Map<string, UploadRecordResult>();

    for (let curr of chunks) {
      const response = await this.request<TreeResult>(
        connection,
        `composite/tree/${objectName}`,
        { records: curr },
        RequestMethod.POST
      );
      response.results.forEach((result) => {
        results.set(result.referenceId, {
          ...result,
          hasErrors: Array.isArray(result.errors) && result.errors.length > 0,
        });
      });
    }

    return results;
  }

  public static async createOne(
    connection: Connection,
    objectName: string,
    referenceId: string,
    data: any
  ): Promise<UploadRecordResult> {
    try {
      const url = 'sobjects/' + objectName;

      const response = await this.request<UploadRecordResult>(connection, url, data, RequestMethod.POST);
      return { ...response, referenceId, hasErrors: response.errors.length > 0 };
    } catch (err) {
      const errors = this.extractErrorMessages(err);
      Logger.logVerbose(`Failed to create ${objectName} (referenceId: ${referenceId}): ${errors.join('; ')}`);
      return {
        referenceId,
        hasErrors: true,
        success: false,
        errors,
        warnings: [],
      };
    }
  }

  public static async updateOne(
    connection: Connection,
    objectName: string,
    referenceId: string,
    recordId: string,
    data: any
  ): Promise<UploadRecordResult> {
    try {
      const url = 'sobjects/' + objectName + '/' + recordId;

      await this.request<UploadRecordResult>(connection, url, data, RequestMethod.PATCH);

      return {
        referenceId,
        hasErrors: false,
        success: true,
        errors: [],
        warnings: [],
      };
    } catch (err) {
      const errors = this.extractErrorMessages(err);
      Logger.logVerbose(
        `Failed to update ${objectName} (id: ${recordId}): ${errors.join('; ')}\nPayload fields: ${Object.keys(
          data ?? {}
        ).join(', ')}`
      );
      return {
        referenceId,
        hasErrors: true,
        success: false,
        errors,
        warnings: [],
      };
    }
  }

  public static async update(connection: Connection, data: any[]): Promise<Map<string, UploadRecordResult>> {
    // Metadata API only accepts 200 records per request
    const chunks = chunk(data, NetUtils.CHUNK_SIZE),
      results = new Map<string, UploadRecordResult>();

    for (let curr of chunks) {
      const response = await this.request<UploadRecordResult[]>(
        connection,
        'composite/sobjects',
        { records: curr },
        RequestMethod.PATCH
      );

      response.forEach((result) => {
        results.set(result.referenceId || result.id, {
          ...result,
          hasErrors: Array.isArray(result.errors) && result.errors.length > 0,
        });
      });
    }

    return results;
  }

  public static async delete(connection: Connection, data: string[]): Promise<boolean> {
    // Metadata API only accepts 200 records per request
    const chunks = chunk(data, NetUtils.CHUNK_SIZE);

    for (let curr of chunks) {
      const deleteUrl = 'composite/sobjects?allOrNone=true&ids=' + curr.join(',');

      const response = await this.request<UploadRecordResult[]>(connection, deleteUrl, [], RequestMethod.DELETE);

      if (!response.every((r) => r.success)) return false;
    }

    return true;
  }

  public static async deleteWithFieldIntegrityException(
    connection: Connection,
    data: string[]
  ): Promise<{ success: boolean; statusCode?: string; message?: string }> {
    // Metadata API only accepts 200 records per request
    const chunks = chunk(data, NetUtils.CHUNK_SIZE);
    let hasFieldIntegrityException = false;
    let hasErrors = false;
    let errorCode: string | undefined;
    let message: string | undefined;

    for (let curr of chunks) {
      const deleteUrl = 'composite/sobjects?allOrNone=true&ids=' + curr.join(',');

      const response = await this.request<DeleteResponse[]>(connection, deleteUrl, [], RequestMethod.DELETE);
      // Check each response for errors
      response.forEach((result) => {
        if (!result.success && result.errors && result.errors.length > 0) {
          result.errors.forEach((error) => {
            hasErrors = true;
            // Check if this error is a FIELD_INTEGRITY_EXCEPTION
            if (error.statusCode === 'FIELD_INTEGRITY_EXCEPTION') {
              hasFieldIntegrityException = true;
              message = error.message;
              return;
            } else {
              errorCode = error.statusCode;
            }
          });
        }
      });
    }

    // If there are failed records, return failure with status code
    if (hasErrors) {
      return {
        success: false,
        // Override with FIELD_INTEGRITY_EXCEPTION if found, otherwise use first encountered
        statusCode: hasFieldIntegrityException ? 'FIELD_INTEGRITY_EXCEPTION' : errorCode,
        message: message,
      };
    }

    return { success: true };
  }

  public static async request<TResultType>(
    connection: Connection,
    url: string,
    data: any,
    method: RequestMethod
  ): Promise<TResultType> {
    const apiVersion = connection.getApiVersion();
    const metadataApiUrl = `/services/data/v${apiVersion}/${url}`;
    const request = {
      method: method as any,
      url: metadataApiUrl,
      body: JSON.stringify(data),
    };

    const response = await connection.request<TResultType>(request as any);

    return response;
  }
}

enum RequestMethod {
  POST = 'post',
  GET = 'get',
  PATCH = 'patch',
  DELETE = 'delete',
}

interface TreeResult {
  hasErrors: boolean;
  results: UploadRecordResult[];
}

interface DeleteResponse {
  id: string;
  success: boolean;
  errors: Array<{
    statusCode: string;
    message: string;
    fields: string[];
  }>;
}

export { NetUtils, RequestMethod, TreeResult };
