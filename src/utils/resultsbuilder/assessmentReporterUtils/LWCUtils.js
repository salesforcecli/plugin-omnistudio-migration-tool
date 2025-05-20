const lwcHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OmniStudio Migration Assessment</title>
    <link rel="stylesheet" href="lwc_assessment.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
</head>
<body>
    <h1>OmniStudio Migration Assessment</h1>
    <h2>LWC Assessment</h2>
    <div class="table-container">
        <table id="assessmentTable">
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Path</th>
                    <th>Diff</th>
                    <th>Errors</th>
                </tr>
            </thead>
            <tbody>
                <!-- Rows will be dynamically generated here -->
            </tbody>
        </table>
    </div>
    <div id="diffModal" class="modal">
        <div class="modal-content">
            <span class="close-button">&times;</span>
            <h2>Summary</h2>
            <div class="code-container">
                <pre id="fullDiffContent"></pre>
            </div>
        </div>
    </div>
    <script src="lwc_assessment.js"></script>
</body>
</html>`;

const lwcJs = `
function createTableRow(fileName, filePath, diff, moduleName, errors) {
    const row = document.createElement('tr');

    // Name column
    const nameCell = document.createElement('td');
    nameCell.textContent = moduleName;
    row.appendChild(nameCell);

    // Path column
    const pathCell = document.createElement('td');
    const link = document.createElement('a');
    link.href = filePath;
    link.textContent = fileName;
    pathCell.appendChild(link);
    row.appendChild(pathCell);

    // Diff column
    const diffCell = document.createElement('td');
    let originalLine = 1, modifiedLine = 1;
    let lineCount = 0;
    diff.forEach(([original, modified]) => {
        if (lineCount < 5) {
            const line = document.createElement('div');
            if (original === modified) {
                line.className = 'diff-unchanged';
                line.textContent = '• Line ' + modifiedLine + ': ' + original;
                modifiedLine++;
                originalLine++;
            } else if (original !== null && modified === null) {
                line.className = 'diff-deleted';
                line.textContent = '- Line ' + originalLine + ': ' + original;
                originalLine++;
            } else if (original === null && modified !== null) {
                line.className = 'diff-added';
                line.textContent = '+ Line ' + modifiedLine + ': ' + modified;
                modifiedLine++;
            }
            diffCell.appendChild(line);
            lineCount++;
        }
    });
    if (diff.length > 5) {
        const ellipsis = document.createElement('div');
        ellipsis.textContent = '........';
        diffCell.appendChild(ellipsis);

        const expandButton = document.createElement('button');
        expandButton.innerHTML = '<i class="fa-solid fa-up-right-and-down-left-from-center"></i>';
        expandButton.className = 'expand-button';
        expandButton.onclick = () => showFullDiff(diff);
        diffCell.appendChild(expandButton);
    }
    row.appendChild(diffCell);

    // Error column
    const errorCell = document.createElement('td');
    errorCell.textContent = errors.join(', ');
    row.appendChild(errorCell);

    return row;
}

function showFullDiff(diff) {
    const modal = document.getElementById('diffModal');
    const fullDiffContent = document.getElementById('fullDiffContent');
    fullDiffContent.innerHTML = ''; // Use innerHTML to allow HTML content
    let originalLine = 1, modifiedLine = 1;
    diff.forEach(([original, modified]) => {
        const line = document.createElement('div');
        if (original === modified) {
            line.className = 'diff-unchanged';
            line.textContent = '• Line ' + modifiedLine + ': ' + original;
            modifiedLine++;
            originalLine++;
        } else if (original !== null && modified === null) {
            line.className = 'diff-deleted';
            line.textContent = '- Line ' + originalLine + ': ' + original;
            originalLine++;
        } else if (original === null && modified !== null) {
            line.className = 'diff-added';
            line.textContent = '+ Line ' + modifiedLine + ': ' + modified;
            modifiedLine++;
        }
        fullDiffContent.appendChild(line);
    });
    modal.style.display = 'block';
}

function populateTable(data) {
    const tableBody = document.getElementById('assessmentTable').querySelector('tbody');
    data.forEach(module => {
      module.changeInfos.forEach(item => {
        if (item.diff.length > 2) {
            const row = createTableRow(item.name, item.path, item.diff, module.name, module.errors);
            tableBody.appendChild(row);
        }
      });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    populateTable(jsonData); // Pass jsonData to the function
    const modal = document.getElementById('diffModal');
    const closeButton = document.querySelector('.close-button');
    closeButton.onclick = () => {
        modal.style.display = 'none';
    };
    window.onclick = (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    };
});`;

const lwcCss = `body {
    font-family: Arial, sans-serif;
    margin: 0;
    padding: 20px;
}

h1, h2 {
    text-align: center;
}

.table-container {
    margin: 0 auto;
    width: 98%;
}

table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 20px;
}

th, td {
    border: 1px solid #ddd;
    padding: 8px;
    text-align: left;
    position: relative;
}

th {
    background-color: #f2f2f2;
}

.diff-added {
    color: green;
}

.diff-deleted {
    color: red;
}

.diff-unchanged {
    color: black;
}

.modal {
    display: none;
    position: fixed;
    z-index: 1;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    overflow: auto;
    background-color: rgb(0,0,0);
    background-color: rgba(0,0,0,0.4);
}

.modal-content {
    background-color: #fff;
    margin: 15% auto;
    border: 1px solid #888;
    width: 80%;
}

.close-button {
    color: #aaa;
    float: right;
    font-size: 28px;
    font-weight: bold;
    margin-right: 10px;
}

.close-button:hover,
.close-button:focus {
    color: black;
    text-decoration: none;
    cursor: pointer;
}

.expand-button {
    position: absolute;
    top: 5px;
    right: 5px;
    cursor: pointer;
}

.code-container {
    padding: 20px 30px;
    background-color: #f0f0f0;
    border-radius: 5px;
}

#fullDiffContent {
    background-color: #fff;
    border-radius: 5px;
    overflow-x: auto;
    margin: 0;
    padding: 10px;
}

.modal-content h2 {
    margin-top: 15px;
}`;

export { lwcHtml, lwcJs, lwcCss };
