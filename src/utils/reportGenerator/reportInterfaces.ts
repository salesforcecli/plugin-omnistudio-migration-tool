/* eslint-disable @typescript-eslint/no-explicit-any */
export interface TableHeaderCell {
  label: string;
  colspan?: number;
  rowspan?: number;
  key: string;
  width?: string;
}

export interface TableColumn<T> {
  key: string;
  cell: any;
  filterValue: any;
  title?: any;
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
