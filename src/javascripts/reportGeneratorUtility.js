let props = {};
let classToHide = 'no-display';

function toggleFilterDropdown(tableId) {
  const reportTable = document.getElementById(tableId);
  const dropdown = reportTable.querySelector('#filter-dropdown');
  const chevronUp = reportTable.querySelector('#chevron-up');
  const chevronDown = reportTable.querySelector('#chevron-down');

  if (dropdown && chevronUp && chevronDown) {
    dropdown.classList.toggle('show');
    chevronUp.classList.toggle('hidden');
    chevronDown.classList.toggle('hidden');
  }
}

function closeFilterDropdown(tableId) {
  const reportTable = document.getElementById(tableId);
  if (!reportTable) return;

  const dropdown = reportTable.querySelector('#filter-dropdown');
  const chevronUp = reportTable.querySelector('#chevron-up');
  const chevronDown = reportTable.querySelector('#chevron-down');

  if (dropdown && dropdown.classList.contains('show')) {
    dropdown.classList.remove('show');
    if (chevronUp) chevronUp.classList.add('hidden');
    if (chevronDown) chevronDown.classList.remove('hidden');
  }
}

function closeAllFilterDropdowns() {
  const openDropdowns = document.querySelectorAll('.filter-dropdown.show');

  openDropdowns.forEach((dropdown) => {
    dropdown.classList.remove('show');
    // Find and update chevron icons
    const container = dropdown.closest('.filter-dropdown-container') || dropdown.parentElement;
    if (container) {
      const chevronUp = container.querySelector('#chevron-up');
      const chevronDown = container.querySelector('#chevron-down');
      if (chevronUp) chevronUp.classList.add('hidden');
      if (chevronDown) chevronDown.classList.remove('hidden');
    }
  });
}

function toggleDiffModal(name) {
  const modal = document.getElementById(`myModal_${name}`);
  modal.style.display = modal.style.display === 'none' ? 'flex' : 'none';
}

function filterAndSearchTable(tableId) {
  const reportTable = document.getElementById(tableId);
  const table = reportTable.querySelector('#filterable-table-body');
  const checkboxes = reportTable.querySelectorAll('.filter-checkbox');
  const searchInput = reportTable.querySelector('#name-search-input');
  const searchText = searchInput.value.trim().toLowerCase();
  const filters = {};
  const rows = Array.from(table?.rows || []);
  let visibleRowCount = 0;

  // Gather checked filter options
  checkboxes.forEach((cb) => {
    const key = cb.getAttribute('data-filter-key');
    if (!key) return;
    if (!filters[key]) filters[key] = [];
    if (cb.checked) filters[key].push(cb.value);
  });

  const noRowsMessage = reportTable.querySelector('#no-rows-message');

  // NEW: If any filter group has zero selected values → show no rows
  const activeFilterKeys = [...new Set([...checkboxes].map((cb) => cb.getAttribute('data-filter-key')))];
  const hasEmptyGroup = activeFilterKeys.some((key) => !filters[key] || filters[key].length === 0);
  if (hasEmptyGroup) {
    // Hide all rows and show no match message
    rows.forEach((row) => {
      if (row.id !== 'no-rows-message') row.style.display = 'none';
    });
    if (noRowsMessage) noRowsMessage.style.display = '';

    // Update visible row count
    const visibleRows = Array.from(table.rows).filter(
      (row) => row.style.display !== 'none' && row.id !== 'no-rows-message'
    );
    reportTable.querySelector('#row-count').textContent = `Total Records: ${visibleRows.length}`;
    return;
  }

  // Otherwise, apply filters and search
  let processedClasses = new Set();

  let classRowMap = new Map();
  rows.forEach((row) => {
    if (row.id === 'no-rows-message') return;

    let show = true;

    // Apply checkbox filters
    for (const key of Object.keys(filters)) {
      const selectedValues = filters[key];
      const cell = Array.from(row.cells).find((c) => c.getAttribute('key') === key);
      const cellValue = cell?.getAttribute('value') || '';
      if (!selectedValues.includes(cellValue)) {
        show = false;
        break;
      }
    }

    // Apply name search filter
    if (show && searchText !== '') {
      const nameCell = row.querySelector('td[data-name]');
      const nameValue = nameCell?.getAttribute('data-name')?.toLowerCase() || '';
      if (!nameValue.includes(searchText)) {
        show = false;
      }
    }

    if (props?.rowBased) {
      if (show && !classRowMap.has(row.classList[0])) {
        classRowMap.set(row.classList[0], { row, cnt: 1 });
      } else if (show) {
        classRowMap.get(row.classList[0]).cnt++;
      }
      row.style.display = show ? '' : 'none';
    } else {
      if (!processedClasses.has(row.classList[0])) {
        hideOrShowData(reportTable, row.classList[0], show);
        processedClasses.add(row.classList[0]);
      }
    }
    if (show) visibleRowCount++;
  });

  if (noRowsMessage) {
    noRowsMessage.style.display = visibleRowCount === 0 ? '' : 'none';
  }

  // Update visible row count
  const visibleRows = Array.from(table.rows).filter(
    (row) => row.style.display !== 'none' && row.id !== 'no-rows-message'
  );

  if (props?.rowBased) {
    rows.forEach((row) => {
      row.cells[0].classList.add(classToHide);
    });

    classRowMap.forEach((value) => {
      value.row.cells[0].classList.remove(classToHide);
      value.row.cells[0].rowSpan = value.cnt;
    });
  }

  // filter only distinct classes from visibleRows
  let recordLabel = props?.recordName || 'records';
  let cnt = visibleRows.length;
  if (!props?.rowCount) {
    cnt = [...new Set(visibleRows.map((row) => row.classList[0]))].length;
  }
  reportTable.querySelector('#row-count').textContent = `Total ${recordLabel}: ${cnt}`;
}

function toggleCtaSummaryPanel() {
  const panel = document.getElementById('cta-summary-panel');
  const main = document.getElementById('main-panel');
  const wrapper = document.getElementById('scrollable-wrapper');

  const isVisible = panel.classList.contains('visible');
  panel.classList.toggle('visible');
  main.classList.toggle('shrunk');

  // Ensure smooth scroll into view when opened
  if (!isVisible) {
    setTimeout(() => {
      wrapper.scrollLeft = wrapper.scrollWidth;
    }, 200); // wait for transition
  }
}
function hideOrShowData(reportTable, rowClass, show) {
  const rows = Array.from(reportTable.querySelectorAll(`.${rowClass}`));
  rows.forEach((row) => {
    row.style.display = show ? '' : 'none';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadProps();
  document.querySelectorAll('.collapsible-content').forEach((collapsibleContent) => {
    collapsibleContent.style.display = 'none';
  });

  var coll = document.getElementsByClassName('collapsible');
  var i;

  for (i = 0; i < coll.length; i++) {
    coll[i].addEventListener('click', function () {
      this.classList.toggle('active');
      var content = this.nextElementSibling;
      if (content.style.display === 'block') {
        content.style.display = 'none';
      } else {
        content.style.display = 'block';
      }
    });
  }

  document.querySelectorAll('.rpt-table-container').forEach((tableContainer) => {
    filterAndSearchTable(tableContainer.id);
  });

  document.querySelectorAll('tr').forEach((row) => {
    row.addEventListener('mouseover', (event) => {
      const className = event.currentTarget.classList[0];
      document.querySelectorAll(`.${className}`).forEach((r) => {
        r.classList.add('highlight');
      });
    });
    row.addEventListener('mouseout', (event) => {
      const className = event.currentTarget.classList[0];
      document.querySelectorAll(`.${className}`).forEach((r) => {
        r.classList.remove('highlight');
      });
    });
  });

  // Attach filter dropdown event listeners after DOM is loaded
  // Close panel and filter dropdown on escape key
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' || event.keyCode === 27) {
      event.preventDefault();

      try {
        closeCtaPanel();
      } catch (error) {
        // Silently handle error if CTA panel elements don't exist
      }

      try {
        closeAllFilterDropdowns();
      } catch (error) {
        // Silently handle error if filter dropdown elements don't exist
      }
    }
  });

  // Close filter dropdown when clicking outside
  document.addEventListener('click', function (event) {
    // Find all open filter dropdowns
    document.querySelectorAll('.filter-dropdown.show').forEach((dropdown) => {
      const reportTable = dropdown.closest('.rpt-table-container');
      const filterButton = reportTable?.querySelector('.filter-toggle-button');

      // Check if click was outside the dropdown and not on the filter button
      if (reportTable && !dropdown.contains(event.target) && !filterButton?.contains(event.target)) {
        closeFilterDropdown(reportTable.id);
      }
    });
  });
});

function openReport(ele) {
  const file = ele.dataset.summary;
  window.open(file, '_blank');
}

function toggleCtaPanel() {
  const panel = document.getElementById('ctaPanel');
  const overlay = document.getElementById('overlay');

  // Only try to toggle if elements exist
  if (panel && overlay) {
    if (panel.classList.contains('open')) {
      closeCtaPanel();
    } else {
      panel.classList.add('open');
      overlay.classList.add('open');
    }
  }
}

function closeCtaPanel() {
  const panel = document.getElementById('ctaPanel');
  const overlay = document.getElementById('overlay');

  // Only try to close if elements exist
  if (panel) {
    panel.classList.remove('open');
  }
  if (overlay) {
    overlay.classList.remove('open');
  }
}

function loadProps() {
  const propElement = document.querySelector('#props');
  if (!propElement) {
    return;
  }

  try {
    props = JSON.parse(propElement.textContent);
  } catch (error) {
    console.error('error parsing props', error);
    return;
  }
  console.log('parsed props', props);
}

/**
 * Helper function to apply sticky styling to a single column
 * Used for reports where only the first column should be frozen:
 * - Custom Labels (rowspan=2, colspan=1) - 180px width
 * - Apex, LWC, Experience Sites, FlexiPage (single-level header) - 250px width
 */
function applySingleColumnFreeze(table, headerCell, columnWidth = 180) {
  // Default to 180px for Custom Labels, but can be overridden for other reports

  // Apply styles to first header cell
  applyStickyStyles(headerCell, columnWidth, 0, 50, '#f3f3f3', true);

  // Ensure all other header cells in both rows are NOT sticky
  const thead = table.querySelector('thead');
  if (thead) {
    const allHeaderCells = thead.querySelectorAll('th');
    allHeaderCells.forEach((th, index) => {
      if (index > 0) {
        removeStickyStyles(th);
      }
    });
  }

  // Apply styles to body cells in first column
  const tbody = table.querySelector('tbody');
  if (tbody) {
    const rows = tbody.querySelectorAll('tr');
    rows.forEach((row) => {
      // Use key="name" selector to handle rowspan correctly
      const firstCell = row.querySelector('td[key="name"]');
      if (firstCell) {
        applyStickyStyles(firstCell, columnWidth, 0, 30, '#fff', true);
      }
    });

    // Ensure all other columns are NOT sticky
    rows.forEach((row) => {
      const cells = Array.from(row.querySelectorAll('td'));
      cells.forEach((cell) => {
        // Remove sticky from any cell that's NOT the name column
        if (cell.getAttribute('key') !== 'name') {
          removeStickyStyles(cell);
        }
      });
    });

    // Add hover effect for first column
    rows.forEach((row) => {
      row.addEventListener('mouseenter', () => {
        const firstCell = row.querySelector('td[key="name"]');
        if (firstCell) {
          firstCell.style.setProperty('background-color', '#f3f3f3', 'important');
        }
      });

      row.addEventListener('mouseleave', () => {
        const firstCell = row.querySelector('td[key="name"]');
        if (firstCell) {
          firstCell.style.setProperty('background-color', '#fff', 'important');
        }
      });
    });
  }
}

/**
 * Helper function to apply sticky styles to a cell
 */
function applyStickyStyles(element, width, left, zIndex, bgColor, addBorder = false) {
  element.style.setProperty('width', `${width}px`, 'important');
  element.style.setProperty('min-width', `${width}px`, 'important');
  element.style.setProperty('max-width', `${width}px`, 'important');
  element.style.setProperty('position', 'sticky', 'important');
  element.style.setProperty('left', `${left}px`, 'important');
  element.style.setProperty('z-index', `${zIndex}`, 'important');
  element.style.setProperty('background-color', bgColor, 'important');
  if (addBorder) {
    element.style.setProperty('border-right', '1px solid #e5e5e5', 'important');
  }
}

/**
 * Helper function to remove sticky styles from a cell
 */
function removeStickyStyles(element) {
  element.style.setProperty('position', 'static', 'important');
  element.style.setProperty('left', 'auto', 'important');
  element.style.setProperty('width', 'auto', 'important');
  element.style.setProperty('min-width', 'auto', 'important');
  element.style.setProperty('max-width', 'none', 'important');
}

/**
 * Apply sticky styles to header cells for multi-column freeze
 */
function applyMultiColumnHeaderFreeze(firstHeaderCell, secondRow, colspan, baseColumnWidth, firstColumnWidth) {
  // Calculate total width for the first header
  const totalHeaderWidth = firstColumnWidth + (colspan - 1) * baseColumnWidth;

  // Apply styles to first row first header
  applyStickyStyles(firstHeaderCell, totalHeaderWidth, 0, 20, '#f3f3f3', true);

  // Apply styles to second row headers (sub-headers under the first header)
  const secondRowHeaders = Array.from(secondRow.querySelectorAll('th'));
  let cumulativeLeft = 0;

  for (let i = 0; i < secondRowHeaders.length; i++) {
    const header = secondRowHeaders[i];

    if (i < colspan) {
      // Freeze this column
      const columnWidth = i === 0 ? firstColumnWidth : baseColumnWidth;
      const isLastFrozen = i === colspan - 1;
      applyStickyStyles(header, columnWidth, cumulativeLeft, 50, '#f3f3f3', isLastFrozen);
      cumulativeLeft += columnWidth;
    } else {
      // Ensure non-frozen columns are NOT sticky
      removeStickyStyles(header);
    }
  }
}

/**
 * Remove sticky styles from non-frozen first-row headers
 */
function removeNonFrozenHeaderStyles(firstRow) {
  const firstRowHeaders = Array.from(firstRow.querySelectorAll('th'));
  for (let i = 1; i < firstRowHeaders.length; i++) {
    removeStickyStyles(firstRowHeaders[i]);
  }
}

/**
 * Apply sticky styles to body cells for multi-column freeze
 */
function applyMultiColumnBodyFreeze(tbody, colspan, baseColumnWidth, firstColumnWidth) {
  const rows = tbody.querySelectorAll('tr');

  rows.forEach((row) => {
    const cells = Array.from(row.querySelectorAll('td'));
    let cumulativeLeft = 0;

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];

      if (i < colspan) {
        // Freeze this column
        const columnWidth = i === 0 ? firstColumnWidth : baseColumnWidth;
        const isLastFrozen = i === colspan - 1;
        applyStickyStyles(cell, columnWidth, cumulativeLeft, 30, '#fff', isLastFrozen);
        cumulativeLeft += columnWidth;
      } else {
        // Ensure non-frozen columns are NOT sticky
        removeStickyStyles(cell);
      }
    }
  });
}

/**
 * Add hover effects to frozen cells
 */
function addHoverEffects(tbody, colspan) {
  const rows = tbody.querySelectorAll('tr');

  rows.forEach((row) => {
    row.addEventListener('mouseenter', () => {
      const cells = Array.from(row.querySelectorAll('td'));
      for (let i = 0; i < colspan && i < cells.length; i++) {
        cells[i].style.setProperty('background-color', '#f3f3f3', 'important');
      }
    });

    row.addEventListener('mouseleave', () => {
      const cells = Array.from(row.querySelectorAll('td'));
      for (let i = 0; i < colspan && i < cells.length; i++) {
        cells[i].style.setProperty('background-color', '#fff', 'important');
      }
    });
  });
}

/**
 * Handle multi-column freeze (for reports with colspan > 1)
 */
function handleMultiColumnFreeze(table, firstHeaderCell, firstRow, secondRow, colspan) {
  const baseColumnWidth = 200;
  const firstColumnWidth = 250;

  // Apply header styles
  applyMultiColumnHeaderFreeze(firstHeaderCell, secondRow, colspan, baseColumnWidth, firstColumnWidth);

  // Remove sticky from other first-row headers
  removeNonFrozenHeaderStyles(firstRow);

  // Apply body cell styles
  const tbody = table.querySelector('tbody');
  if (tbody) {
    applyMultiColumnBodyFreeze(tbody, colspan, baseColumnWidth, firstColumnWidth);
    addHoverEffects(tbody, colspan);
  }
}

/**
 * Process a single table for sticky column application
 */
function processTable(table) {
  const thead = table.querySelector('thead');
  if (!thead) return;

  const firstRow = thead.querySelector('tr:first-child');
  const secondRow = thead.querySelector('tr:nth-child(2)');

  if (!firstRow) return;

  // Get the first header cell and its colspan/rowspan
  const firstHeaderCell = firstRow.querySelector('th:first-child');
  if (!firstHeaderCell) return;

  const colspan = parseInt(firstHeaderCell.getAttribute('colspan') || '1', 10);
  const rowspan = parseInt(firstHeaderCell.getAttribute('rowspan') || '1', 10);

  // Handle single column with rowspan=2 (e.g., Custom Labels)
  if (rowspan === 2 && colspan === 1) {
    applySingleColumnFreeze(table, firstHeaderCell, 180);
    return;
  }

  // Handle single-level header (e.g., Apex, LWC, Experience Sites, FlexiPage)
  if (rowspan === 1 && colspan === 1 && !secondRow) {
    applySingleColumnFreeze(table, firstHeaderCell, 250);
    return;
  }

  // Handle multi-column freeze with colspan
  if (secondRow && colspan > 1) {
    handleMultiColumnFreeze(table, firstHeaderCell, firstRow, secondRow, colspan);
  }
}

/**
 * Main function: Dynamically applies sticky column styling to all tables
 * Reads the table structure to determine how many columns should be frozen
 */
function applyDynamicStickyColumns() {
  const tableContainers = document.querySelectorAll('.table-container');

  tableContainers.forEach((container) => {
    const table = container.querySelector('table.slds-table');
    if (table) {
      processTable(table);
    }
  });
}

// Run on page load
document.addEventListener('DOMContentLoaded', applyDynamicStickyColumns);

/**
 * Export visible table data to CSV file
 * Only exports rows that are currently visible (respects active filters and search)
 * Shows visual feedback on the export button to confirm success or indicate failure
 */
function exportTableToCSV(tableId) {
  const exportButton = document.querySelector('.export-csv-button');

  try {
    const reportTable = document.getElementById(tableId);
    if (!reportTable) return;

    // Show "Exporting..." state on button
    if (exportButton) {
      exportButton.textContent = 'Exporting...';
      exportButton.disabled = true;
    }

    // Check if props has a pre-generated CSV file to download (e.g., Custom Labels with all records)
    if (props && props.csvFile) {
      // Download the pre-generated CSV file
      const link = document.createElement('a');
      link.setAttribute('href', props.csvFile);
      link.setAttribute('download', props.csvFile);
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showExportSuccess(exportButton);
      return;
    }

    const table = reportTable.querySelector('table.slds-table');
    if (!table) {
      showExportError(exportButton, 'No table data found');
      return;
    }

    const csvRows = [];

    // Extract headers - flatten multi-row headers into a single row
    const thead = table.querySelector('thead');
    if (thead) {
      const headerRows = thead.querySelectorAll('tr');
      const headers = [];

      if (headerRows.length === 1) {
        // Single-row header
        headerRows[0].querySelectorAll('th').forEach((th) => {
          headers.push(escapeCSVValue(th.textContent.trim()));
        });
      } else if (headerRows.length >= 2) {
        // Multi-row header (e.g., Custom Labels with "Package > Id, Value" and "Core > Id, Value")
        const firstRow = headerRows[0];
        const secondRow = headerRows[1];
        const secondRowHeaders = Array.from(secondRow.querySelectorAll('th'));
        let subHeaderIndex = 0;

        firstRow.querySelectorAll('th').forEach((th) => {
          const colspan = parseInt(th.getAttribute('colspan') || '1', 10);
          const rowspan = parseInt(th.getAttribute('rowspan') || '1', 10);
          const headerName = th.textContent.trim();

          if (rowspan >= 2 || colspan === 1) {
            // This header spans all rows - use it directly
            headers.push(escapeCSVValue(headerName));
            if (rowspan < 2) subHeaderIndex++;
          } else {
            // This header has sub-headers in the second row
            for (let i = 0; i < colspan && subHeaderIndex < secondRowHeaders.length; i++) {
              const subHeader = secondRowHeaders[subHeaderIndex]?.textContent.trim() || '';
              headers.push(escapeCSVValue(`${headerName} - ${subHeader}`));
              subHeaderIndex++;
            }
          }
        });
      }

      csvRows.push(headers.join(','));
    }

    // Extract visible body rows
    const tbody = table.querySelector('tbody');
    if (tbody) {
      const rows = tbody.querySelectorAll('tr');
      rows.forEach((row) => {
        // Skip hidden rows (filtered out) and the "no rows" message
        if (row.style.display === 'none' || row.id === 'no-rows-message') return;

        const cells = [];
        row.querySelectorAll('td').forEach((td) => {
          // Get the text content, handling lists and links
          let value = '';
          const list = td.querySelector('ul');
          if (list) {
            value = Array.from(list.querySelectorAll('li'))
              .map((li) => li.textContent.trim())
              .join('; ');
          } else {
            value = td.textContent.trim();
          }
          cells.push(escapeCSVValue(value));
        });
        csvRows.push(cells.join(','));
      });
    }

    // Generate and download CSV
    const csvContent = csvRows.join('\n');
    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    // Use the report title for the filename
    const title = document.querySelector('.slds-text-heading_large span')?.textContent.trim() || 'report';
    const filename = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_export.csv`;

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showExportSuccess(exportButton);
  } catch (error) {
    console.error('CSV export failed:', error);
    showExportError(exportButton, 'Export failed');
  }
}

/**
 * Show success state on the export button briefly, then reset
 */
function showExportSuccess(button) {
  if (!button) return;
  button.textContent = '✓ Exported';
  button.style.backgroundColor = '#2e844a';
  button.disabled = false;
  setTimeout(() => {
    button.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">' +
      '<path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5"/>' +
      '<path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708z"/>' +
      '</svg> Export CSV';
    button.style.backgroundColor = '';
  }, 2000);
}

/**
 * Show error state on the export button briefly, then reset
 */
function showExportError(button, message) {
  if (!button) return;
  button.textContent = message || 'Export failed';
  button.style.backgroundColor = '#c23934';
  button.disabled = false;
  setTimeout(() => {
    button.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">' +
      '<path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5"/>' +
      '<path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708z"/>' +
      '</svg> Export CSV';
    button.style.backgroundColor = '';
  }, 3000);
}

/**
 * Escape a value for CSV format
 * Wraps in quotes if it contains commas, quotes, or newlines
 */
function escapeCSVValue(value) {
  if (value == null) return '""';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Expose globally so HTML inline event handlers can access them
window.toggleFilterDropdown = toggleFilterDropdown;
window.closeFilterDropdown = closeFilterDropdown;
window.closeAllFilterDropdowns = closeAllFilterDropdowns;
window.filterAndSearchTable = filterAndSearchTable;
window.toggleCtaSummaryPanel = toggleCtaSummaryPanel;
window.applyDynamicStickyColumns = applyDynamicStickyColumns;
window.exportTableToCSV = exportTableToCSV;
