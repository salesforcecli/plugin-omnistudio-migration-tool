import { Filter, HeaderColumn, ReportHeader, TableColumn, TableHeaderCell } from './reportInterfaces';

export function generateHtmlTable<T>(
  headerRows: HeaderColumn[],
  columns: Array<TableColumn<T>>,
  rows: T[],
  reportHeader: ReportHeader[],
  filters: Filter[] = [],
  tableClass = 'slds-table slds-table_cell-buffer slds-table_bordered slds-table_striped slds-table_col-bordered',
  ariaLabel = ''
): string {
  const transformedHeader: TableHeaderCell[][] = transform(headerRows);

  const thead = `
    <thead>
      ${transformedHeader
        .map(
          (row) => `
        <tr>
          ${row
            .map((cell: TableHeaderCell) => {
              const colspanAttr = cell.colspan ? `colspan="${cell.colspan}"` : '';
              const rowspanAttr = cell.rowspan ? `rowspan="${cell.rowspan}"` : '';
              const styleAttr = `style="${cell.styles ?? 'width:auto;'}"`;
              return `
                <th ${colspanAttr} ${rowspanAttr} ${styleAttr}>
                  <div class="filter-header">
                    <span class="filter-label">${cell.label}</span>
                  </div>
                </th>
              `;
            })
            .join('')}
        </tr>
      `
        )
        .join('')}
    </thead>
  `;

  const filterAndSearchPanel = `
  <div class="filter-dropdown-container">
  <div class="filter-header-bar">
    <!-- Row count display -->
    <div class="row-count-display" id="row-count">
      Showing ${rows.length} records
    </div>

    <!-- Search and filter controls -->
    <div class="search-container">
      <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="black" viewBox="0 0 16 16">
        <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85zm-5.242 1.156a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"/>
      </svg>
      <input
        type="text"
        id="name-search-input"
        class="search-input"
        placeholder="Search by Name"
        oninput="filterAndSearchTable()"
      />
    </div>
 
    <div class="filter-toggle-button" onclick="toggleFilterDropdown()">
      Filters
      <svg id="chevron-down" class="chevron-icon" xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="currentColor" viewBox="0 0 16 16">
        <path fill-rule="none" stroke="currentColor" stroke-width="2" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708"/>
      </svg>
      <svg id="chevron-up" class="chevron-icon hidden" xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="currentColor" viewBox="0 0 16 16">
        <path fill-rule="none" stroke="currentColor" stroke-width="2" d="M7.646 4.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1-.708.708L8 5.707l-5.646 5.647a.5.5 0 0 1-.708-.708z"/>
      </svg>
    </div>
  </div>

  <div id="filter-dropdown" class="filter-dropdown">
    ${filters
      .map(
        (filter) => `
      <div class="filter-group">
        <div class="filter-group-label">Filter by ${filter.label}</div>
        <div class="filter-options">
          ${filter.filterOptions
            .map(
              (option) => `
            <label>
              <input
                type="checkbox"
                class="filter-checkbox"
                data-filter-key="${filter.key}"
                value="${option}"
                checked
                onclick="filterAndSearchTable()"
              />
              ${option}
            </label>
          `
            )
            .join('')}
        </div>
      </div>
    `
      )
      .join('')}
  </div>
</div>`;

  const tbody = `
    <tbody id="filterable-table-body">
      ${rows
        .map(
          (row) => `
        <tr>
        
          ${columns
            /* eslint-disable @typescript-eslint/no-unsafe-assignment */
            /* eslint-disable @typescript-eslint/no-unsafe-call */
            /* eslint-disable @typescript-eslint/no-unsafe-member-access */
            .map((col) => {
              const key: string = col.key;
              const title: string = col.title ? col.title(row) : '';
              const value: string = col.filterValue(row).toString();
              const cellContent: string = col.cell(row);
              const style: string = col.styles ? col.styles(row) : '';
              const dataAttr: string = ['name', 'oldName'].includes(key) ? `data-name="${value.toLowerCase()}"` : '';
              return `<td ${dataAttr} title="${title}" key="${key}" value="${value}" style="${style}">${cellContent}</td>`;
            })
            .join('')}
        </tr>
      `
        )
        .join('')}
        <tr id="no-rows-message" style="display: none;">
          <td colspan="100%" style="text-align: center; padding: 16px; color: #666;">
            No matching records found.
          </td>
        </tr>
    </tbody>
  `;

  const pageHeader = `
    <div class="header-container">
      ${reportHeader
        .map(
          (header) => `
        <div class="org-details-section">
          <div class="label-key">${header.key}</div>
          <div class="label-value">${header.value}</div>
        </div>
      `
        )
        .join('')}
    </div>
  `;

  const migrationBanner = `
    <div class="migration-message">
      <svg fill="#8c4c00" width="20px" height="20px" viewBox="-3.2 -3.2 38.40 38.40" xmlns="http://www.w3.org/2000/svg" stroke="#8c4c00" stroke-width="0.0032">
        <path d="M31.082 27.5l-13.999-24.249c-0.237-0.352-0.633-0.58-1.083-0.58s-0.846 0.228-1.080 0.575l-0.003 0.005-14 24.249c-0.105 0.179-0.167 0.395-0.167 0.625 0 0.69 0.56 1.25 1.25 1.25h28c0.69 0 1.249-0.56 1.249-1.25 0-0.23-0.062-0.446-0.171-0.631zM4.165 26.875l11.835-20.499 11.834 20.499zM14.75 12v8.994c0 0.69 0.56 1.25 1.25 1.25s1.25-0.56 1.25-1.25V12c0-0.69-0.56-1.25-1.25-1.25s-1.25 0.56-1.25 1.25zM15.12 23.619c-0.124 0.106-0.22 0.24-0.278 0.394-0.051 0.143-0.08 0.308-0.08 0.48s0.029 0.337 0.083 0.491c0.144 0.3 0.38 0.536 0.671 0.676 0.143 0.051 0.308 0.080 0.48 0.080s0.337-0.029 0.49-0.083c0.156-0.071 0.288-0.166 0.4-0.281 0.224-0.225 0.363-0.536 0.363-0.878 0-0.687-0.557-1.244-1.244-1.244-0.343 0-0.653 0.139-0.878 0.363z"/>
      </svg>
      <span>High level description of what actions were taken as part of the migration will come here</span>
    </div>
  `;

  return `
    ${migrationBanner}
    ${pageHeader}
    ${filterAndSearchPanel}
    <div class="table-container">
      <table class="${tableClass}" aria-label="${ariaLabel}">
        ${thead}
        ${tbody}
      </table>
      <script src="./reportGeneratorUtility.js" defer></script>
      <link rel="stylesheet" href="./reportGenerator.css">
    </div>
  `;
}

function transform(columnInput): TableHeaderCell[][] {
  const row1 = [];
  const row2 = [];

  columnInput.forEach((item) => {
    if (item.subColumn && item.subColumn.length > 0) {
      row1.push({
        label: item.label,
        colspan: item.subColumn.length,
      });

      item.subColumn.forEach((sub) => {
        row2.push({
          label: sub.label,
          key: sub.key,
        });
      });
    } else {
      const row1Entry: TableHeaderCell = {
        label: item.label,
      };

      if (item.rowspan) row1Entry.rowspan = Number(item.rowspan);
      if (item.key) row1Entry.key = item.key;

      row1.push(row1Entry);
    }
  });

  return [row1, row2] as unknown as TableHeaderCell[][];
}
