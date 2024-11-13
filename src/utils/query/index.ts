import { Connection } from '@salesforce/core';
import { AnyJson } from '@salesforce/ts-types';

/* eslint-disable */
export class QueryTools {
  public static buildCustomObjectQuery(namespace: string, name: string, fields: string[], filters?: Map<string, any>) {
    const queryFields = this.buildCustomObjectFields(namespace, ['Id', ...fields]);

    let query = 'SELECT ' + queryFields.join(', ') + ' FROM ' + namespace + '__' + name;

    const andFilters = [];
    if (filters && filters.size > 0) {
      for (let filter of filters.keys()) {
        andFilters.push(`${filter} = ${QueryTools.getFilterValue(filters.get(filter))}`);
      }

      query += ' WHERE ' + andFilters.join(' AND ');
    }

    return query;
  }

  public static buildCustomObjectFields(namespace: string, fields: string[]): string[] {
    const queryFields = [];
    fields.forEach((field) => {
      if (field.indexOf('__') > -1) {
        queryFields.push(namespace + '__' + field);
      } else {
        queryFields.push(field);
      }
    });

    return queryFields;
  }

  public static async queryAll(
    connection: Connection,
    namespace: string,
    objectName: string,
    fields: string[]
  ): Promise<AnyJson[]> {
    let allrecords = [];

    const query = QueryTools.buildCustomObjectQuery(namespace, objectName, fields);

    // Execute the query
    let results = await connection.query<Record<string, any>>(query);

    if (results && results.totalSize > 0) {
      allrecords = results.records;

      // Load more pages
      while (results.nextRecordsUrl) {
        results = await connection.queryMore<Record<string, any>>(results.nextRecordsUrl);
        results.records.forEach((row) => {
          allrecords.push(row);
        });
      }
    }

    return allrecords;
  }

  public static async queryWithFilter(
    connection: Connection,
    namespace: string,
    objectName: string,
    fields: string[],
    filters?: Map<string, any>
  ): Promise<AnyJson[]> {
    let allrecords = [];

    const query = QueryTools.buildCustomObjectQuery(namespace, objectName, fields, filters);

    // Execute the query
    let results = await connection.query<Record<string, any>>(query);

    if (results && results.totalSize > 0) {
      allrecords = results.records;

      // Load more pages
      while (results.nextRecordsUrl) {
        results = await connection.queryMore<Record<string, any>>(results.nextRecordsUrl);
        results.records.forEach((row) => {
          allrecords.push(row);
        });
      }
    }

    return allrecords;
  }

  public static async queryWithFilterAndSort(
    connection: Connection,
    namespace: string,
    objectName: string,
    fields: string[],
    filters?: Map<string, any>,
    orderBy?: Array<SortField>
  ): Promise<AnyJson[]> {
    let allrecords = [];

    let query = QueryTools.buildCustomObjectQuery(namespace, objectName, fields, filters);
    if (orderBy && orderBy.length > 0) {
      const sortings = [];
      for (let ob of orderBy) {
        sortings.push(ob.field + ' ' + ob.direction);
      }
      query += ' ORDER BY ' + sortings.join(', ');
    }

    // Execute the query
    let results = await connection.query<Record<string, any>>(query);

    if (results && results.totalSize > 0) {
      allrecords = results.records;

      // Load more pages
      while (results.nextRecordsUrl) {
        results = await connection.queryMore<Record<string, any>>(results.nextRecordsUrl);
        results.records.forEach((row) => {
          allrecords.push(row);
        });
      }
    }

    return allrecords;
  }

  public static async query(
    connection: Connection,
    objectName: string,
    fields: string[],
    filters?: Map<string, any>,
    orderBy?: Array<SortField>
  ) {
    let query = 'SELECT ' + fields.join(', ') + ' FROM ' + objectName;

    const andFilters = [];
    if (filters && filters.size > 0) {
      for (let filter of filters.keys()) {
        andFilters.push(`${filter} = ${QueryTools.getFilterValue(filters.get(filter))}`);
      }

      query += ' WHERE ' + andFilters.join(' AND ');
    }

    if (orderBy && orderBy.length > 0) {
      const sortings = [];
      for (let ob of orderBy) {
        sortings.push(ob.field + ' ' + ob.direction);
      }
      query += ' ORDER BY ' + sortings.join(', ');
    }

    // Execute the query
    let results = await connection.query<Record<string, any>>(query);

    let allrecords = [];
    if (results && results.totalSize > 0) {
      allrecords = results.records;

      // Load more pages
      while (results.nextRecordsUrl) {
        results = await connection.queryMore<Record<string, any>>(results.nextRecordsUrl);
        results.records.forEach((row) => {
          allrecords.push(row);
        });
      }
    }

    return allrecords;
  }

  public static async queryIds(
    connection: Connection,
    objectName: string,
    filters?: Map<string, any>
  ): Promise<string[]> {
    let allrecords = [];
    const andFilters = [];

    let query = `SELECT ID FROM ${objectName}`;

    if (filters && filters.size > 0) {
      for (let filter of filters.keys()) {
        andFilters.push(`${filter} = ${QueryTools.getFilterValue(filters.get(filter))}`);
      }

      query += ' WHERE ' + andFilters.join(' AND ');
    }

    // Execute the query
    let results = await connection.query<Record<string, any>>(query);

    if (results && results.totalSize > 0) {
      allrecords = results.records;

      // Load more pages
      while (results.nextRecordsUrl) {
        results = await connection.queryMore<Record<string, any>>(results.nextRecordsUrl);
        results.records.forEach((row) => {
          allrecords.push(row);
        });
      }
    }

    return allrecords.map((record) => record['Id']);
  }

  private static getFilterValue(val: any): string {
    switch (typeof val) {
      case 'bigint':
      case 'boolean':
      case 'number':
        return `${val}`;
      case 'function':
        return `'${val()}'`;
      case 'undefined':
        return 'NULL';
      case 'string':
      default:
        return `'${val}'`;
    }
  }
}

export enum SortDirection {
  ASC = 'asc',
  DESC = 'desc',
}
export interface SortField {
  field: string;
  direction: SortDirection;
}
