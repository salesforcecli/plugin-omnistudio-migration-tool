/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { expect } from 'chai';
import { Connection } from '@salesforce/core';
import sinon = require('sinon');
import { NetUtils, RequestMethod } from '../../src/utils/net';

describe('NetUtils RequestMethod', () => {
  let sandbox: sinon.SinonSandbox;
  let connection: Connection;
  let requestStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    requestStub = sandbox.stub().resolves({ success: true, errors: [] });
    connection = {
      getApiVersion: sandbox.stub().returns('68.0'),
      request: requestStub,
    } as unknown as Connection;
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('sends uppercase HTTP verbs so undici fetch does not leave patch unnormalized', () => {
    expect(RequestMethod.GET).to.equal('GET');
    expect(RequestMethod.POST).to.equal('POST');
    expect(RequestMethod.PATCH).to.equal('PATCH');
    expect(RequestMethod.DELETE).to.equal('DELETE');
  });

  it('uses PATCH when updating a single record', async () => {
    await NetUtils.updateOne(connection, 'OmniDataTransform', 'ref-1', '0ji000000000001', { Name: 'GetData' });

    expect(requestStub.calledOnce).to.be.true;
    const requestArg = requestStub.firstCall.args[0];
    expect(requestArg.method).to.equal('PATCH');
    expect(requestArg.url).to.equal('/services/data/v68.0/sobjects/OmniDataTransform/0ji000000000001');
  });

  it('uses PATCH when updating a composite batch', async () => {
    requestStub.resolves([{ referenceId: 'ref-1', success: true, errors: [] }]);

    await NetUtils.update(connection, [{ attributes: { type: 'OmniUiCard' }, Id: '0ko000000000001' }]);

    expect(requestStub.calledOnce).to.be.true;
    expect(requestStub.firstCall.args[0].method).to.equal('PATCH');
  });
});
