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

function toggleDiffModal(name) {
  const modal = document.getElementById(`myModal_${name}`);
  modal.style.display = modal.style.display === 'none' ? 'flex' : 'none';
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

    // row.style.display = show ? '' : 'none';
    if (!processedClasses.has(row.classList[0])) {
      hideOrShowData(reportTable, row.classList[0], show);
      processedClasses.add(row.classList[0]);
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
  reportTable.querySelector('#row-count').textContent = `Showing ${visibleRows.length} record${
    visibleRows.length !== 1 ? 's' : ''
  }`;
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
});

function openReport(ele) {
  const file = ele.dataset.summary;
  window.open(file, '_blank');
}

function toggleCtaPanel() {
  const panel = document.getElementById('ctaPanel');
  const overlay = document.getElementById('overlay');

  if (panel.classList.contains('open')) {
    closeCtaPanel();
  } else {
    panel.classList.add('open');
    overlay.classList.add('open');
  }
}

function closeCtaPanel() {
  const panel = document.getElementById('ctaPanel');
  const overlay = document.getElementById('overlay');

  panel.classList.remove('open');
  overlay.classList.remove('open');
}

// Close panel on escape key
document.addEventListener('keydown', function (event) {
  if (event.key === 'Escape') {
    closeCtaPanel();
  }
});

// Expose globally so HTML inline event handlers can access them
window.toggleFilterDropdown = toggleFilterDropdown;
window.filterAndSearchTable = filterAndSearchTable;
window.toggleCtaSummaryPanel = toggleCtaSummaryPanel;
