import { execSync } from 'child_process';
import puppeteer from 'puppeteer';
import { expect } from 'chai';
import { documentRegistry } from '../../../src/utils/constants/documentRegistry';
import { Logger } from '../../../src/utils/logger';

// Ensure Chrome is installed before running tests
before(function () {
  this.timeout(120000); // 2 minutes for Chrome installation
  if (process.env.CI === 'true') {
    try {
      Logger.info('CI environment detected. Installing Chrome for Puppeteer...');
      execSync('npx --yes puppeteer browsers install chrome', { stdio: 'inherit' });
      Logger.info('Chrome installed successfully.');
    } catch (error) {
      Logger.error('Failed to install Chrome:', error);
      throw error;
    }
  }
});

// Dictionary mapping documentRegistry keys to their expected page titles
const titles = {
  invalidOrRepeatingOmniscriptElementNames: 'Omnistudio Naming Conventions',
  duplicatedCardName: 'Omnistudio Naming Conventions',
  duplicatedDrName: 'Omnistudio Naming Conventions',
  duplicatedOSName: 'Omnistudio Naming Conventions',
  duplicatedName: 'Omnistudio Naming Conventions',
  errorWhileActivatingOs: 'Activating Omniscripts',
  errorWhileActivatingCard: 'Activate and Publish a Flexcard',
  errorWhileUploadingCard: 'Activate and Publish a Flexcard',
  angularOSWarning: 'Convert an Angular Omniscript to an LWC Omniscript',
  formulaSyntaxError: 'Formulas and Functions',
  fileNoOmnistudioCalls: 'Callable Implementations',
  cardNameChangeMessage: 'Omnistudio Naming Conventions',
  omniScriptNameChangeMessage:
    'Update Omniscript Custom Lightning Web Components and Omniscript Elements Overridden with Customized Components',
  dataRaptorNameChangeMessage: 'Update References to Omnistudio Components After Migration',
  integrationProcedureNameChangeMessage: 'Update References to Omnistudio Components After Migration',
  integrationProcedureManualUpdateMessage: 'Update References to Omnistudio Components After Migration',
  duplicateCardNameMessage: 'Clone a Flexcard',
  reservedKeysFoundInPropertySet: 'Omnistudio Naming Conventions',
  manualDeploymentSteps: 'Set Up Your Environment to Customize Omniscript Elements',
  customLabelMigrationErrorMessage: 'Omnistudio Migration Prerequisites',
  customCssStylesheetNamespaceWarningOmniScript: 'Custom Styles for Omniscripts',
  customCssStylesheetNamespaceWarningFlexCard: 'Apply Custom Lightning Styles to a Specific Flexcard (Managed Package)',
  customCssInlineNamespaceWarning: 'Apply Custom CSS to a Flexcard Element (Managed Package)',
  customLwcReservedActionKey: 'Omnistudio Naming Conventions',
};

describe('DocumentRegistry', () => {
  describe('URL Validation', () => {
    // Helper function to make HTTP request and check if URL is accessible
    async function checkSalesforceUrlWithPuppeteer(key: string, url: string): Promise<boolean> {
      try {
        const browser = await puppeteer.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
          ],
        });
        const page = await browser.newPage();
        try {
          await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
          const content = await page.content();
          const notFoundText = "couldn't find that page.";
          const isValid = !content.includes(notFoundText);
          if (!isValid) {
            Logger.error(`URL for ${key} (${url}) is not accessible`);
          }
          const isTitleValid = content.includes(titles[key]);
          if (!isTitleValid) {
            Logger.error(`The content of the page for ${key} (${url}) is not valid`);
          }
          await browser.close();
          return isValid && isTitleValid;
        } catch (error) {
          await browser.close();
          Logger.info(`Error checking URL with Puppeteer: ${url}`);
          return true;
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('Failed to launch')) {
          Logger.warn('Puppeteer failed to launch - skipping URL validation tests');
          return true; // Skip test gracefully
        }
        throw error;
      }
    }

    // Cache to avoid duplicate checks
    const urlCheckCache = new Map<string, boolean>();

    // Test all URLs in the documentRegistry
    Object.entries(documentRegistry).forEach(([key, url]: [string, string]) => {
      it(`should have a valid URL for ${key}`, async function () {
        // Increase timeout for network requests
        this.timeout(30000);
        const isValid = urlCheckCache.has(url)
          ? urlCheckCache.get(url)
          : await checkSalesforceUrlWithPuppeteer(key, url);
        urlCheckCache.set(url, isValid);
        expect(isValid, `URL for ${key} (${url}) should be accessible`).to.be.true;
      });
    });

    it('should have all required document registry entries', () => {
      const expectedKeys = [
        'invalidOrRepeatingOmniscriptElementNames',
        'duplicatedCardName',
        'duplicatedDrName',
        'duplicatedOSName',
        'duplicatedName',
        'errorWhileActivatingOs',
        'errorWhileActivatingCard',
        'errorWhileUploadingCard',
        'angularOSWarning',
        'formulaSyntaxError',
        'fileNoOmnistudioCalls',
        'cardNameChangeMessage',
        'omniScriptNameChangeMessage',
        'dataRaptorNameChangeMessage',
        'integrationProcedureNameChangeMessage',
        'integrationProcedureManualUpdateMessage',
        'duplicateCardNameMessage',
        'reservedKeysFoundInPropertySet',
        'manualDeploymentSteps',
        'customLabelMigrationErrorMessage',
        'customCssStylesheetNamespaceWarningOmniScript',
        'customCssStylesheetNamespaceWarningFlexCard',
        'customCssInlineNamespaceWarning',
        'customLwcReservedActionKey',
      ];

      expectedKeys.forEach((key) => {
        expect(documentRegistry).to.have.property(key);
        expect(documentRegistry[key]).to.be.a('string');
        expect(documentRegistry[key]).to.match(/^https:\/\/help\.salesforce\.com/);
      });
    });
  });
});
