/* eslint-disable @typescript-eslint/no-explicit-any */
export interface TableColumn<T> {
  key: string;
  cell: any;
  filterValue: any;
  title?: any;
  styles?: any;
  rowspan?: (arg0: T, arg1: number) => number;
  skip?: (arg0: T, arg1: number) => boolean;
}

export interface Filter {
  label: string;
  key: string;
  filterOptions: string[];
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
  key?: string;
  colspan?: number;
  rowspan?: number;
  styles?: string;
  subColumn?: HeaderColumn[]; // Recursive definition
}

export interface TableHeaderCell {
  label: string;
  colspan?: number;
  rowspan?: number;
  key?: string;
  width?: string;
  styles?: string;
}

export interface ComponentDetail {
  name: string;
  title: string;
  count: number;
  completed?: number;
  errored?: number;
  skipped?: number;
}
