/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { expect } from 'chai';
import { Connection } from '@salesforce/core';
import sinon = require('sinon');
import { OrgUtils } from '../../src/utils/orgUtils';
import { OrgPreferences } from '../../src/utils/orgPreferences';
import { QueryTools } from '../../src/utils/query';
import { Logger } from '../../src/utils/logger';

// W-24296247: orgs with Vlocity Insurance (vlocity_ins) plus the Insurance Industries Extension (vlocity_ins_fsc)
// used to prompt for both namespaces, but only vlocity_ins is a primary OmniStudio namespace
describe('OrgUtils - package selection', () => {
  let sandbox: sinon.SinonSandbox;
  let connection: Connection;
  let logStub: sinon.SinonStub;

  const pkg = (NamespacePrefix: string, MajorVersion = 890, MinorVersion = 1): any => ({
    NamespacePrefix,
    MajorVersion,
    MinorVersion,
    Name: 'Salesforce',
  });
  const filter = (packages: any[]): any[] => (OrgUtils as any).filterPrimaryPackages(packages);
  const names = (packages: any[]): string[] => packages.map((p) => p.NamespacePrefix);

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    connection = {} as unknown as Connection;
    logStub = sandbox.stub(Logger, 'log');
    sandbox.stub(Logger, 'logVerbose');
    sandbox.stub(Logger, 'warn');
  });

  afterEach(() => sandbox.restore());

  describe('filterPrimaryPackages', () => {
    it('drops extension packages that are not primary namespaces', () => {
      const result = filter([pkg('vlocity_ins'), pkg('vlocity_ins_fsc', 891, 125)]);

      expect(names(result)).to.deep.equal(['vlocity_ins']);
      expect(logStub.calledWithMatch('vlocity_ins_fsc')).to.be.true;
    });

    it('keeps every installed primary namespace', () => {
      const result = filter([pkg('vlocity_cmt'), pkg('vlocity_ins'), pkg('omnistudio'), pkg('vlocity_ps')]);

      expect(names(result)).to.deep.equal(['vlocity_cmt', 'vlocity_ins', 'omnistudio', 'vlocity_ps']);
      expect(logStub.called).to.be.false;
    });

    it('keeps the devops primary namespaces', () => {
      const result = filter([pkg('devopsimpkg11'), pkg('devops001gs0'), pkg('devopsimpkg13')]);

      expect(names(result)).to.deep.equal(['devopsimpkg11', 'devops001gs0']);
    });

    it('drops non-primary packages when Foundation is installed alongside them', () => {
      const result = filter([pkg('omnistudio'), pkg('vlocity_ins_fsc')]);

      expect(names(result)).to.deep.equal(['omnistudio']);
    });

    it('falls back to all packages when none of them are primary namespaces', () => {
      const packages = [pkg('vlocityins2'), pkg('vlocityins2_fsc')];

      const result = filter(packages);

      expect(result).to.equal(packages);
      expect(logStub.called).to.be.false;
    });
  });

  describe('getOrgDetails', () => {
    let promptStub: sinon.SinonStub;

    beforeEach(() => {
      promptStub = sandbox.stub(Logger, 'prompt');
      sandbox.stub(OrgUtils, 'isOmniStudioOrgPermissionEnabled').resolves(false);
      sandbox.stub(OrgUtils, 'isOmnistudioMetadataAPIEnabled').resolves(false);
      sandbox.stub(OrgPreferences, 'isFoundationPackage').resolves(false);
    });

    const stubInstalledPackages = (packages: any[]): void => {
      const queryAllStub = sandbox.stub(QueryTools, 'queryAll');
      queryAllStub.withArgs(connection, '', 'Publisher', sinon.match.any).resolves(packages);
      queryAllStub.withArgs(connection, '', 'Organization', sinon.match.any).resolves([{ Name: 'Org', Id: '00D' }]);
    };

    it('selects the only primary package without prompting', async () => {
      stubInstalledPackages([pkg('vlocity_ins', 890, 491), pkg('vlocity_ins_fsc', 891, 125), pkg('SIM', 0, 0)]);
      // Fail fast instead of looping forever on an invalid selection if the package isn't filtered out
      promptStub.rejects(new Error('Unexpected package selection prompt'));

      const result = await OrgUtils.getOrgDetails(connection);

      expect(promptStub.called).to.be.false;
      expect(result.packageDetails).to.deep.equal({ namespace: 'vlocity_ins', version: '890.491' });
    });

    it('still prompts when more than one primary package is installed', async () => {
      stubInstalledPackages([pkg('vlocity_ins', 890, 491), pkg('vlocity_cmt', 890, 100)]);
      promptStub.resolves('2');

      const result = await OrgUtils.getOrgDetails(connection);

      expect(promptStub.calledOnce).to.be.true;
      // packages are listed alphabetically: 1. vlocity_cmt, 2. vlocity_ins
      expect(result.packageDetails.namespace).to.equal('vlocity_ins');
    });
  });
});
