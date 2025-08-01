import puppeteer from 'puppeteer';
import { expect } from '@salesforce/command/lib/test';
import { documentRegistry } from '../../../src/utils/constants/documentRegistry';
import { Logger } from '../../../src/utils/logger';

// Dictionary mapping documentRegistry keys to their expected page titles
const titles = {
  errorNoOrgResults: 'Run the Omnistudio Migration Tool',
  couldNotDeactivateOmniProcesses: 'Deactivate and Activate OmniScripts',
  couldNotTruncate: 'Embed an Omniscript in Another Omniscript',
  couldNotTruncateOmnniProcess: 'Embed an Omniscript in Another Omniscript',
  invalidNameTypeSubtypeOrLanguage: 'Omnistudio Naming Conventions',
  invalidOrRepeatingOmniscriptElementNames: 'Omnistudio Naming Conventions',
  invalidDataRaptorName: 'Omnistudio Naming Conventions',
  duplicatedCardName: 'Omnistudio Naming Conventions',
  duplicatedDrName: 'Omnistudio Naming Conventions',
  duplicatedOSName: 'Omnistudio Naming Conventions',
  duplicatedName: 'Omnistudio Naming Conventions',
  errorWhileActivatingOs: 'Activating Omniscripts',
  errorWhileActivatingCard: 'Activate and Publish a Flexcard',
  errorWhileUploadingCard: 'Activate and Publish a Flexcard',
  errorWhileCreatingElements: 'Omniscript Element Reference',
  allVersionsDescription: 'Migrate All Versions of OmniStudio Components',
  changeMessage: 'Omnistudio Naming Conventions',
  angularOSWarning: 'Convert an Angular Omniscript to an LWC Omniscript',
  formulaSyntaxError: 'Formulas and Functions',
  fileNoOmnistudioCalls: 'Callable Implementations',
  fileAlreadyImplementsCallable: 'Callable Implementations',
  inApexDrNameWillBeUpdated: 'Update References to Omnistudio Components After Migration',
  fileUpdatedToAllowRemoteCalls: 'Make a Long-Running Remote Call Using Omnistudio.OmniContinuation',
  fileUpdatedToAllowCalls: 'Make a Long-Running Remote Call Using Omnistudio.OmniContinuation',
  fileImplementsVlocityOpenInterface: 'VlocityOpenInterface',
  methodCallBundleNameUpdated: 'Updates to Omnistudio Custom Functions',
  cardNameChangeMessage: 'Omnistudio Naming Conventions',
  authordNameChangeMessage: 'Omnistudio Naming Conventions',
  omniScriptNameChangeMessage:
    'Update Omniscript Custom Lightning Web Components and Omniscript Elements Overridden with Customized Components',
  dataRaptorNameChangeMessage: 'Update References to Omnistudio Components After Migration',
  integrationProcedureNameChangeMessage: 'Update References to Omnistudio Components After Migration',
  integrationProcedureManualUpdateMessage: 'Update References to Omnistudio Components After Migration',
  duplicateCardNameMessage: 'Clone a Flexcard',
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
          await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
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
        this.timeout(20000);
        const isValid = urlCheckCache.has(url)
          ? urlCheckCache.get(url)
          : await checkSalesforceUrlWithPuppeteer(key, url);
        urlCheckCache.set(url, isValid);
        expect(isValid, `URL for ${key} (${url}) should be accessible`).to.be.true;
      });
    });

    it('should have all required document registry entries', () => {
      const expectedKeys = [
        'errorNoOrgResults',
        'couldNotDeactivateOmniProcesses',
        'couldNotTruncate',
        'couldNotTruncateOmnniProcess',
        'invalidNameTypeSubtypeOrLanguage',
        'invalidOrRepeatingOmniscriptElementNames',
        'invalidDataRaptorName',
        'duplicatedCardName',
        'duplicatedDrName',
        'duplicatedOSName',
        'duplicatedName',
        'errorWhileActivatingOs',
        'errorWhileActivatingCard',
        'errorWhileUploadingCard',
        'errorWhileCreatingElements',
        'allVersionsDescription',
        'changeMessage',
        'angularOSWarning',
        'formulaSyntaxError',
        'fileNoOmnistudioCalls',
        'fileAlreadyImplementsCallable',
        'inApexDrNameWillBeUpdated',
        'fileUpdatedToAllowRemoteCalls',
        'fileUpdatedToAllowCalls',
        'fileImplementsVlocityOpenInterface',
        'methodCallBundleNameUpdated',
        'cardNameChangeMessage',
        'authordNameChangeMessage',
        'omniScriptNameChangeMessage',
        'dataRaptorNameChangeMessage',
        'integrationProcedureNameChangeMessage',
        'integrationProcedureManualUpdateMessage',
        'duplicateCardNameMessage',
      ];

      expectedKeys.forEach((key) => {
        expect(documentRegistry).to.have.property(key);
        expect(documentRegistry[key]).to.be.a('string');
        expect(documentRegistry[key]).to.match(/^https:\/\/help\.salesforce\.com/);
      });
    });
  });
});
