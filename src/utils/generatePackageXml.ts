import * as fs from 'fs';
import * as path from 'path';

// Method to generate package.xml with additional types
function createChangeList(apexClasses: string[], lwcComponents: string[]): void {
  const apexXml = apexClasses.map((name) => `<members>${name}</members>`).join('\n        ');
  const lwcXml = lwcComponents.map((name) => `<members>${name}</members>`).join('\n        ');

  const additionalTypes = `
    <types>
        <members>*</members>
        <name>OmniDataTransform</name>
    </types>
    <types>
        <members>*</members>
        <name>OmniIntegrationProcedure</name>
    </types>
    <types>
        <members>*</members>
        <name>OmniScript</name>
    </types>
    <types>
        <members>*</members>
        <name>OmniUiCard</name>
    </types>
  `;

  const packageXmlContent = `
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        ${apexXml}
        <name>ApexClass</name>
    </types>
    <types>
        ${lwcXml}
        <name>LightningComponentBundle</name>
    </types>
    ${additionalTypes}
    <version>57.0</version>
</Package>
`;

  const filePath = path.join(__dirname, 'package.xml');
  fs.writeFileSync(filePath, packageXmlContent.trim());
}

// Backup method without additional types
function backupChangeList(apexClasses: string[], lwcComponents: string[]): void {
  const apexXml = apexClasses.map((name) => `<members>${name}</members>`).join('\n        ');
  const lwcXml = lwcComponents.map((name) => `<members>${name}</members>`).join('\n        ');

  const packageXmlContent = `
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        ${apexXml}
        <name>ApexClass</name>
    </types>
    <types>
        ${lwcXml}
        <name>LightningComponentBundle</name>
    </types>
    <version>57.0</version>
</Package>
`;

  const filePath = path.join(__dirname, 'backup-package.xml');
  fs.writeFileSync(filePath, packageXmlContent.trim());
}

// remove all this code later --- only for testing 
const apexClasses = ['MyApexClass1', 'MyApexClass2'];
const lwcComponents = ['MyLwcComponent1', 'MyLwcComponent2'];

// creating normal package.xml with additional types
createChangeList(apexClasses, lwcComponents);

// creating backup-package.xml without additional types
backupChangeList(apexClasses, lwcComponents);
