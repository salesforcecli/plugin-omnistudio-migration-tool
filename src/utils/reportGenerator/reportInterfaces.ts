import { oldNew } from '../interfaces';

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface TableColumn<T> {
  key: string;
  cell: (row: T, arg1?: number) => string;
  filterValue?: (row: T, arg1?: number) => string | string[] | oldNew[];
  title?: (row: T, arg1?: number) => string;
  styles?: (row: T, arg1?: number) => string;
  icon?: (row: T, arg1?: number) => string;
  rowspan?: (arg0: T, arg1?: number) => number;
  skip?: (arg0: T, arg1?: number) => boolean;
}

export interface Filter {
  label: string;
  filterOptions: string[];
  key: string;
}

export interface ReportHeader {
  key: string;
  value: string;
}

export interface ReportHeaderFormat {
  key: string;
  value: string;
}

export interface HeaderColumn {
  label: string;
  colspan?: number;
  rowspan?: number;
  key?: string;
  styles?: string;
  subColumn?: SubColumn[];
}

export interface TableHeaderCell {
  label: string;
  colspan?: number;
  rowspan?: number;
  key?: string;
  width?: string;
  styles?: string;
}

export type CTASummary = {
  name: string;
  message: string;
  link: string;
};

export interface SubColumn {
  label: string;
  key?: string;
}

export interface ComponentDetail {
  name: string;
  title: string;
  count: number;
  complete?: number;
  error?: number;
  skip?: number;
}

export interface ReportFrameworkParameters<T> {
  headerColumns: HeaderColumn[];
  columns: Array<TableColumn<T>>;
  rows: T[];
  orgDetails: ReportHeader[];
  filters: Filter[];
  ctaSummary: CTASummary[];
  reportHeaderLabel: string;
  indexedKey?: string;
  showMigrationBanner: boolean;
}
