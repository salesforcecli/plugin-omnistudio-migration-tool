import { Org } from '@salesforce/core';

import sinon = require('sinon');
import { expect } from '@salesforce/command/lib/test';
import { Connection, ExecuteAnonymousResult } from 'jsforce';
import { AnonymousApexRunner } from '../../../../src/utils/apex/executor/AnonymousApexRunner';

describe('AnonymusApexRunner', () => {
  let org: Org;
  // let executeAnonymousStub: sinon.SinonStub;
  let sandboxStub: sinon.SinonSandbox;

  beforeEach(async () => {
    sandboxStub = sinon.createSandbox();
    const getConnectionStub = sandboxStub.stub().returns({
      tooling: {
        executeAnonymous: () => {},
      },
    } as unknown as Connection);
    sandboxStub.stub(Org.prototype, 'getConnection').callsFake(getConnectionStub);
    org = new Org({});
  });

  afterEach(() => {
    // executeAnonymousStub.restore();
    sandboxStub.restore();
  });

  it('should run anonymous Apex correctly', async () => {
    const anonymousApex = "System.debug('Hello, World');";
    const expectedResponse = { success: true };

    const executeAnonymousResultStub = sandboxStub
      .stub()
      .returns(Promise.resolve({ success: true } as unknown as ExecuteAnonymousResult));
    sandboxStub.stub(Org.prototype.getConnection().tooling, 'executeAnonymous').callsFake(executeAnonymousResultStub);
    // .stub(org.getConnection().tooling.executeAnonymous(), 'executeAnonymous')
    // .returns(Promise.resolve({ success: true } as unknown as ExecuteAnonymousResult));

    const result = await AnonymousApexRunner.run(org, anonymousApex);

    expect(result).to.deep.equal(expectedResponse);
    sinon.assert.calledOnce(executeAnonymousResultStub);
    sinon.assert.calledWith(executeAnonymousResultStub, anonymousApex);
  });

  it('should handle executeAnonymous errors', async () => {
    const anonymousApex = "System.debug 'Hello, World');";
    const executeAnonymousError = new Error('Error executing anonymous Apex');
    const executeAnonymousResultStub = sandboxStub.stub().rejects(executeAnonymousError);
    // executeAnonymousStub.rejects(executeAnonymousError);
    sandboxStub.stub(Org.prototype.getConnection().tooling, 'executeAnonymous').callsFake(executeAnonymousResultStub);

    try {
      await AnonymousApexRunner.run(org, anonymousApex);
      throw new Error('Test should have thrown an error');
    } catch (error) {
      expect(error).to.equal(executeAnonymousError);
      sinon.assert.calledOnce(executeAnonymousResultStub);
      sinon.assert.calledWith(executeAnonymousResultStub, anonymousApex);
    }
  });
});
