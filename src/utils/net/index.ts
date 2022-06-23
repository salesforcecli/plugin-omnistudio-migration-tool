/* eslint-disable */
import { Connection } from '@salesforce/core';
import chunk from 'lodash.chunk';
import { UploadRecordResult } from '../../migration/interfaces';

class NetUtils {

    private static readonly CHUNK_SIZE = 200;

    public static async create(connection: Connection, objectName: string, data: any[]): Promise<Map<string, UploadRecordResult>> {
        // Metadata API only accepts 200 records per request
        const chunks = chunk(data, NetUtils.CHUNK_SIZE),
            results = new Map<string, UploadRecordResult>();

        for (let curr of chunks) {
            const response = await this.request<TreeResult>(connection, `composite/tree/${objectName}`, { records: curr }, RequestMethod.POST);
            response.results.forEach(result => {
                results.set(result.referenceId, {
                    ...result,
                    hasErrors: Array.isArray(result.errors) && result.errors.length > 0
                });
            });
        }

        return results;
    }

    public static async createOne(connection: Connection, objectName: string, referenceId: string, data: any): Promise<UploadRecordResult> {

        try {
            const url = 'sobjects/' + objectName;

            const response = await this.request<UploadRecordResult>(connection, url, data, RequestMethod.POST);
            return { ...response, referenceId, hasErrors: response.errors.length > 0 };

        } catch (err) {
            return {
                referenceId,
                hasErrors: true,
                success: false,
                errors: err,
                warnings: []
            };
        }
    }

    public static async updateOne(connection: Connection, objectName: string, referenceId: string, recordId: string, data: any): Promise<UploadRecordResult> {

        try {
            const url = 'sobjects/' + objectName + '/' + recordId;

            await this.request<UploadRecordResult>(connection, url, data, RequestMethod.PATCH);

            return {
                referenceId,
                hasErrors: false,
                success: true,
                errors: [],
                warnings: []
            }

        } catch (err) {
            return {
                referenceId,
                hasErrors: true,
                success: false,
                errors: err,
                warnings: []
            };
        }
    }

    public static async update(connection: Connection, data: any[]): Promise<Map<string, UploadRecordResult>> {
        // Metadata API only accepts 200 records per request
        const chunks = chunk(data, NetUtils.CHUNK_SIZE),
            results = new Map<string, UploadRecordResult>();

        for (let curr of chunks) {
            const response = await this.request<UploadRecordResult[]>(connection, 'composite/sobjects', { records: curr }, RequestMethod.PATCH);

            response.forEach(result => {
                results.set(result.referenceId || result.id, {
                    ...result,
                    hasErrors: Array.isArray(result.errors) && result.errors.length > 0
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

            if (!response.every(r => r.success)) return false;
        }

        return true;
    }

    public static async request<TResultType>(connection: Connection, url: string, data: any, method: RequestMethod): Promise<TResultType> {

        const apiVersion = connection.getApiVersion();
        const metadataApiUrl = `/services/data/v${apiVersion}/${url}`;
        const request = {
            method: method,
            url: metadataApiUrl,
            body: JSON.stringify(data)
        }

        const response = await connection.request<TResultType>(request);

        return response;
    }
}

enum RequestMethod {
    POST = 'post',
    GET = 'get',
    PATCH = 'patch',
    DELETE = 'delete'
}

interface TreeResult {
    hasErrors: boolean,
    results: UploadRecordResult[]
}

export { NetUtils, RequestMethod, TreeResult }