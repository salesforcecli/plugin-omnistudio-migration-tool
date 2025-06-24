import fs from 'fs';
import path from 'path';

const data = {};

function generateModulesHTML(modules: typeof data.modules): string {
  return modules.map(mod => `
    <div class="dashboard-module-card">
      <div>
        <div class="dashboard-module-title">${mod.title}</div>
        <div class="dashboard-module-total">${mod.total}</div>
        <div class="dashboard-module-row">
          With Warning and Errors
          <span class="dashboard-module-warn">${mod.withWarningAndErrors.toString().padStart(2, '0')}</span>
        </div>
        <div class="dashboard-module-row">
          No Migration needed
          <span class="dashboard-module-neutral">${mod.noMigrationNeeded.toString().padStart(2, '0')}</span>
        </div>
        <div class="dashboard-module-row">
          With No Errors (Automated)
          <span class="dashboard-module-success">${mod.withNoErrors.toString().padStart(2, '0')}</span>
        </div>
      </div>
      <button class="dashboard-module-btn">View Assessment Report</button>
    </div>
  `).join('\n');
}

export function generateAssessmentHomePageHTML(): string {
  const templatePath = path.join(__dirname, '../templates/AssessmentHomePage.template.html');
  let template = fs.readFileSync(templatePath, 'utf-8');

  template = template
    .replace('{{orgName}}', data.orgInfo.name)
    .replace('{{orgId}}', data.orgInfo.orgId)
    .replace('{{packageName}}', data.orgInfo.packageName)
    .replace('{{dataModelType}}', data.orgInfo.dataModelType)
    .replace('{{assessmentDateTime}}', data.orgInfo.assessmentDateTime)
    .replace('{{modules}}', generateModulesHTML(data.modules));

  return template;
}