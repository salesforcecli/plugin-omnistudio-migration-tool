import { expect } from 'chai';
import * as sinon from 'sinon';
import { ux } from '@salesforce/command';
import OmniStudioBaseCommand from '../../basecommand';
import { LWCComponentMigrationTool, CustomLabelMigrationTool, ApexClassMigrationTool } from '../../../migration/interfaces';
import OmnistudioRelatedObjectMigrationFacade from '../../../path/to/OmnistudioRelatedObjectMigrationFacade'; // Adjust import as necessary
import { DebugTimer, MigratedObject, MigratedRecordInfo } from '../../../utils';
import { MigrationResult, MigrationTool } from '../../../migration/interfaces';

describe('OmnistudioRelatedObjectMigrationFacade', function () {
  let facade: OmnistudioRelatedObjectMigrationFacade;
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    // Stub the necessary methods and objects
    facade = new OmnistudioRelatedObjectMigrationFacade();
    sandbox.stub(facade, 'org').value({
      getConnection: () => ({
        setApiVersion: sinon.stub(),
        instanceUrl: 'http://example.com'
      })
    });

    sandbox.stub(facade, 'logger').value({
      error: sinon.stub(),
      debug: sinon.stub()
    });

    sandbox.stub(facade, 'ux').value(ux);
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should migrate all specified objects', async function () {
    const migrationResult: MigrationResult = {
      records: new Map(),
      results: new Map()
    };

    const lwcTool = sandbox.createStubInstance(LWCComponentMigrationTool);
    const labelsTool = sandbox.createStubInstance(CustomLabelMigrationTool);
    const apexTool = sandbox.createStubInstance(ApexClassMigrationTool);

    lwcTool.migrate.resolves([{ name: 'LWC Component', id: '001' }]);
    labelsTool.migrate.resolves([{ name: 'Custom Label', id: '002' }]);
    apexTool.migrate.resolves([{ name: 'Apex Class', id: '003' }]);

    sandbox.stub(facade, 'migrateAll').resolves({
      objectMigrationResults: [
        { name: 'LWC Component', data: [] },
        { name: 'Custom Label', data: [] },
        { name: 'Apex Class', data: [] }
      ]
    });

    await facade.migrateAll(migrationResult, 'testNamespace', ['lwc', 'labels', 'apex']);

    expect(lwcTool.migrate.calledOnce).to.be.true;
    expect(labelsTool.migrate.calledOnce).to.be.true;
    expect(apexTool.migrate.calledOnce).to.be.true;

    // Assert that the migration results are processed correctly
    expect(facade.logger.debug.calledOnce).to.be.true;
    expect(facade.ux.log.called).to.have.lengthOf(3); // Assuming each tool logs once
  });

  it('should handle errors during migration', async function () {
    const migrationResult: MigrationResult = {
      records: new Map(),
      results: new Map()
    };

    const lwcTool = sandbox.createStubInstance(LWCComponentMigrationTool);
    const labelsTool = sandbox.createStubInstance(CustomLabelMigrationTool);
    const apexTool = sandbox.createStubInstance(ApexClassMigrationTool);

    lwcTool.migrate.rejects(new Error('LWC migration error'));
    labelsTool.migrate.resolves([{ name: 'Custom Label', id: '002' }]);
    apexTool.migrate.resolves([{ name: 'Apex Class', id: '003' }]);

    sandbox.stub(facade, 'migrateAll').resolves({
      objectMigrationResults: [
        { name: 'LWC Component', data: [], errors: ['LWC migration error'] },
        { name: 'Custom Label', data: [] },
        { name: 'Apex Class', data: [] }
      ]
    });

    await facade.migrateAll(migrationResult, 'testNamespace', ['lwc', 'labels', 'apex']);

    expect(lwcTool.migrate.calledOnce).to.be.true;
    expect(labelsTool.migrate.calledOnce).to.be.true;
    expect(apexTool.migrate.calledOnce).to.be.true;

    // Check that the error was logged
    expect(facade.logger.error.calledOnce).to.be.true;
    expect(facade.ux.log.called).to.have.lengthOf(3); // Assuming each tool logs once
  });
});