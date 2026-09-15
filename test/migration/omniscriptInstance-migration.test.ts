/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable camelcase */
import { expect } from 'chai';
import { Connection, Messages } from '@salesforce/core';
import { Ux } from '@salesforce/sf-plugins-core';
import sinon = require('sinon');
import { OmniScriptInstanceMigrationTool } from '../../src/migration/omniscriptInstance';
import { Logger } from '../../src/utils/logger';
import { NetUtils } from '../../src/utils/net';
import * as dataModelService from '../../src/utils/dataModelService';

describe('OmniScriptInstanceMigrationTool - Migration', () => {
  let sandbox: sinon.SinonSandbox;
  let tool: OmniScriptInstanceMigrationTool;
  let createStub: sinon.SinonStub;
  let createOneStub: sinon.SinonStub;
  let updateStub: sinon.SinonStub;

  const instance = (index: number): any => ({
    Id: `legacy-${index}`,
    Name: `Session-${index}`,
    vlocity_ins__OmniScriptType__c: 'Type',
    vlocity_ins__OmniScriptSubType__c: 'SubType',
    vlocity_ins__OmniScriptLanguage__c: 'en',
    vlocity_ins__ResumeUrl__c: `/vlocityLWCOmniWrapper?c__InstanceId=legacy-${index}`,
    vlocity_ins__RelativeResumeUrl__c: `/vlocityLWCOmniWrapper?c__InstanceId=legacy-${index}`,
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(dataModelService, 'isStandardDataModel').returns(false);
    sandbox.stub(dataModelService, 'isStandardDataModelWithMetadataAPIEnabled').returns(false);
    sandbox.stub(Logger, 'log');
    sandbox.stub(Logger, 'logVerbose');
    sandbox.stub(Logger, 'debug');
    sandbox.stub(Logger, 'error');
    sandbox.stub(Logger, 'warn');

    const connection = { request: sandbox.stub() } as unknown as Connection;
    const messages = { getMessage: sandbox.stub().callsFake((key: string) => key) } as unknown as Messages<string>;
    tool = new OmniScriptInstanceMigrationTool('vlocity_ins', connection, {} as Logger, messages, {} as Ux);

    sandbox.stub(tool as any, 'hasStandardFieldPackageSavedSessionId').resolves(true);
    sandbox.stub(tool as any, 'assessPrepare').resolves({
      omniProcessMap: new Map([['TypeSubTypeen', 'omni-process-id']]),
      omniscriptSet: new Set(),
    });
    sandbox.stub(tool as any, 'queryAttachments').resolves([]);
    createStub = sandbox.stub(NetUtils, 'create');
    createOneStub = sandbox.stub(NetUtils, 'createOne');
    updateStub = sandbox.stub(NetUtils, 'update').callsFake((_connection: Connection, records: any[]) =>
      Promise.resolve(
        new Map(
          records.map((record) => [
            record.Id,
            {
              referenceId: record.Id,
              id: record.Id,
              success: true,
              hasErrors: false,
              errors: [],
              warnings: [],
            },
          ])
        )
      )
    );
  });

  afterEach(() => sandbox.restore());

  it('processes source records in bounded chunks of 200', async () => {
    sandbox.stub(tool as any, 'queryOmniscriptInstance').resolves(Array.from({ length: 201 }, (_, i) => instance(i)));
    createStub.callsFake((_connection: Connection, objectName: string, records: any[]) => {
      if (objectName === 'Attachment') return Promise.resolve(new Map());
      return Promise.resolve(
        new Map(
          records.map((record) => [
            record.attributes.referenceId,
            {
              referenceId: record.attributes.referenceId,
              id: `created-${record.attributes.referenceId}`,
              success: true,
              hasErrors: false,
              errors: [],
              warnings: [],
            },
          ])
        )
      );
    });

    await tool.migrate();

    const savedSessionCalls = createStub.getCalls().filter((call) => call.args[1] === 'OmniScriptSavedSession');
    expect(savedSessionCalls.map((call) => call.args[2].length)).to.deep.equal([200, 1]);
    expect(updateStub.getCalls().map((call) => call.args[1].length)).to.deep.equal([200, 1]);
  });

  it('updates a saved session when its Tree create result omits success', async () => {
    sandbox.stub(tool as any, 'queryOmniscriptInstance').resolves([instance(1)]);
    createStub.resolves(new Map([['legacy-1', { referenceId: 'legacy-1', id: 'saved-1', hasErrors: false }]]));

    const [migration] = await tool.migrate();

    expect(updateStub.calledOnce).to.be.true;
    expect(updateStub.firstCall.args[1][0]).to.include({ Id: 'saved-1' });
    expect(updateStub.firstCall.args[1][0].ResumeUrl).to.include('c__InstanceId=saved-1');
    expect((tool as any).queryAttachments.calledOnceWith('legacy-1')).to.be.true;
    expect(migration.results.get('legacy-1')?.success).to.be.true;
  });

  it('accepts an attachment Tree create result that omits success', async () => {
    sandbox.stub(tool as any, 'queryOmniscriptInstance').resolves([instance(1)]);
    (tool as any).queryAttachments.resolves([
      { Id: 'attachment-1', Name: 'one.json', Body: '/body/1', ContentType: 'application/json' },
    ]);
    (tool as any).connection.request.resolves('body');
    createStub.callsFake((_connection: Connection, objectName: string) =>
      Promise.resolve(
        objectName === 'OmniScriptSavedSession'
          ? new Map([['legacy-1', { referenceId: 'legacy-1', id: 'saved-1', hasErrors: false }]])
          : new Map([
              [
                'legacy-1_attachment-1',
                { referenceId: 'legacy-1_attachment-1', id: 'new-attachment-1', hasErrors: false },
              ],
            ])
      )
    );

    const [migration] = await tool.migrate();

    expect(migration.results.get('legacy-1')?.success).to.be.true;
    expect(migration.results.get('legacy-1')?.errors).to.deep.equal([]);
    expect((Logger.warn as sinon.SinonStub).called).to.be.false;
    const attachmentCall = createStub.getCalls().find((call) => call.args[1] === 'Attachment');
    expect(attachmentCall.args[2][0]).to.include({
      Body: Buffer.from('body', 'utf8').toString('base64'),
      ContentType: 'application/json',
    });
  });

  it('rejects saved-session Tree results with explicit failure signals or a missing result or id', async () => {
    sandbox
      .stub(tool as any, 'queryOmniscriptInstance')
      .resolves([instance(1), instance(2), instance(3), instance(4), instance(5)]);
    createStub.resolves(
      new Map([
        ['legacy-1', { referenceId: 'legacy-1', id: 'saved-1', success: false, hasErrors: false }],
        ['legacy-2', { referenceId: 'legacy-2', id: 'saved-2', hasErrors: true }],
        ['legacy-3', { referenceId: 'legacy-3', id: 'saved-3', hasErrors: false, errors: ['failed'] }],
        ['legacy-5', { referenceId: 'legacy-5', hasErrors: false }],
      ])
    );

    const [migration] = await tool.migrate();

    expect(updateStub.called).to.be.false;
    for (const referenceId of ['legacy-1', 'legacy-2', 'legacy-3', 'legacy-4', 'legacy-5']) {
      expect(migration.results.get(referenceId)?.errors.join(' ')).to.include('ossCreateOssFailure');
    }
  });

  it('rejects attachment Tree results with explicit failure signals or a missing result or id', async () => {
    sandbox.stub(tool as any, 'queryOmniscriptInstance').resolves([instance(1)]);
    (tool as any).queryAttachments.resolves(
      Array.from({ length: 5 }, (_, index) => ({
        Id: `attachment-${index + 1}`,
        Name: `${index + 1}.json`,
        Body: `/body/${index + 1}`,
      }))
    );
    (tool as any).connection.request.resolves('body');
    createStub.callsFake((_connection: Connection, objectName: string) =>
      Promise.resolve(
        objectName === 'OmniScriptSavedSession'
          ? new Map([['legacy-1', { referenceId: 'legacy-1', id: 'saved-1', hasErrors: false }]])
          : new Map([
              [
                'legacy-1_attachment-1',
                { referenceId: 'legacy-1_attachment-1', id: 'new-attachment-1', success: false, hasErrors: false },
              ],
              [
                'legacy-1_attachment-2',
                { referenceId: 'legacy-1_attachment-2', id: 'new-attachment-2', hasErrors: true },
              ],
              [
                'legacy-1_attachment-3',
                { referenceId: 'legacy-1_attachment-3', id: 'new-attachment-3', hasErrors: false, errors: ['failed'] },
              ],
              ['legacy-1_attachment-5', { referenceId: 'legacy-1_attachment-5', hasErrors: false }],
            ])
      )
    );

    const [migration] = await tool.migrate();

    expect(migration.results.get('legacy-1')?.success).to.be.false;
    expect(migration.results.get('legacy-1')?.errors).to.have.length(5);
    expect(migration.results.get('legacy-1')?.errors.every((error) => error === 'ossAttachmentUploadFailed')).to.be
      .true;
  });

  it('correlates partial failures and only updates and uploads attachments for successful creates', async () => {
    sandbox.stub(tool as any, 'queryOmniscriptInstance').resolves([instance(1), instance(2)]);
    (tool as any).queryAttachments.onCall(0).resolves([
      { Id: 'attachment-1', Name: 'one.json', Body: '/body/1' },
      { Id: 'attachment-2', Name: 'two.json', Body: '/body/2' },
    ]);
    (tool as any).connection.request.resolves('body');

    createStub.callsFake((_connection: Connection, objectName: string, records: any[]) => {
      if (objectName === 'OmniScriptSavedSession') {
        expect(records[0].attributes).to.deep.equal({
          type: 'OmniScriptSavedSession',
          referenceId: 'legacy-1',
        });
        return Promise.resolve(
          new Map([
            [
              'legacy-1',
              { referenceId: 'legacy-1', id: 'saved-1', success: true, hasErrors: false, errors: [], warnings: [] },
            ],
            [
              'legacy-2',
              { referenceId: 'legacy-2', success: false, hasErrors: true, errors: ['create failed'], warnings: [] },
            ],
          ])
        );
      }
      return Promise.resolve(
        new Map([
          [
            'legacy-1_attachment-1',
            {
              referenceId: 'legacy-1_attachment-1',
              id: 'new-attachment-1',
              success: true,
              hasErrors: false,
              errors: [],
              warnings: [],
            },
          ],
          [
            'legacy-1_attachment-2',
            {
              referenceId: 'legacy-1_attachment-2',
              success: false,
              hasErrors: true,
              errors: ['attachment failed'],
              warnings: [],
            },
          ],
        ])
      );
    });
    updateStub.resolves(
      new Map([['saved-1', { referenceId: 'saved-1', success: true, hasErrors: false, errors: [], warnings: [] }]])
    );

    const [migration] = await tool.migrate();

    const updates = updateStub.firstCall.args[1];
    expect(updates).to.have.length(1);
    expect(updates[0].Id).to.equal('saved-1');
    expect(updates[0].ResumeUrl).to.include('c__InstanceId=saved-1');
    expect(updates[0].attributes).to.deep.equal({ type: 'OmniScriptSavedSession' });
    expect((tool as any).queryAttachments.calledOnceWith('legacy-1')).to.be.true;

    const attachmentCall = createStub.getCalls().find((call) => call.args[1] === 'Attachment');
    expect(attachmentCall.args[2]).to.have.length(2);
    expect(attachmentCall.args[2][0]).to.include({
      ParentId: 'saved-1',
      Name: 'one.json',
      Body: Buffer.from('body', 'utf8').toString('base64'),
    });
    expect(attachmentCall.args[2][0].attributes.referenceId).to.equal('legacy-1_attachment-1');

    expect(migration.results.get('legacy-1')?.success).to.be.false;
    expect(migration.results.get('legacy-1')?.errors.join(' ')).to.include('ossAttachmentUploadFailed');
    expect(migration.results.get('legacy-2')?.success).to.be.false;
    expect(migration.results.get('legacy-2')?.errors.join(' ')).to.include('ossCreateOssFailure');
  });

  it('splits attachment creates by exact UTF-8 request body bytes before 200 records', async () => {
    sandbox.stub(tool as any, 'queryOmniscriptInstance').resolves([instance(1)]);
    (tool as any).queryAttachments.resolves([
      { Id: 'attachment-1', Name: 'one.json', Body: '/body/1' },
      { Id: 'attachment-2', Name: 'two.json', Body: '/body/2' },
    ]);
    (tool as any).connection.request.resolves('x'.repeat(3_000_000));
    createStub.callsFake((_connection: Connection, objectName: string, records: any[]) =>
      Promise.resolve(
        new Map(
          records.map((record) => {
            const referenceId = record.attributes.referenceId;
            return [
              referenceId,
              {
                referenceId,
                id: `created-${referenceId}`,
                success: true,
                hasErrors: false,
                errors: [],
                warnings: [],
              },
            ];
          })
        )
      )
    );

    await tool.migrate();

    const attachmentCalls = createStub.getCalls().filter((call) => call.args[1] === 'Attachment');
    expect(attachmentCalls.map((call) => call.args[2].length)).to.deep.equal([1, 1]);
    expect(
      attachmentCalls.every(
        (call) => Buffer.byteLength(JSON.stringify({ records: call.args[2] }), 'utf8') <= 5 * 1024 * 1024
      )
    ).to.be.true;
  });

  it('retains the 200-record limit for small attachment payloads', async () => {
    sandbox.stub(tool as any, 'queryOmniscriptInstance').resolves([instance(1)]);
    (tool as any).queryAttachments.resolves(
      Array.from({ length: 201 }, (_, index) => ({
        Id: `attachment-${index}`,
        Name: `${index}.json`,
        Body: `/body/${index}`,
      }))
    );
    (tool as any).connection.request.resolves('body');
    createStub.callsFake((_connection: Connection, _objectName: string, records: any[]) =>
      Promise.resolve(
        new Map(
          records.map((record) => [
            record.attributes.referenceId,
            {
              referenceId: record.attributes.referenceId,
              id: `created-${record.attributes.referenceId}`,
              success: true,
              hasErrors: false,
              errors: [],
              warnings: [],
            },
          ])
        )
      )
    );

    await tool.migrate();

    const attachmentCalls = createStub.getCalls().filter((call) => call.args[1] === 'Attachment');
    expect(attachmentCalls.map((call) => call.args[2].length)).to.deep.equal([200, 1]);
  });

  it('correlates attachment failures across byte batches to different parent sessions', async () => {
    sandbox.stub(tool as any, 'queryOmniscriptInstance').resolves([instance(1), instance(2)]);
    (tool as any).queryAttachments.callsFake((parentId: string) =>
      Promise.resolve([{ Id: `attachment-${parentId}`, Name: `${parentId}.json`, Body: `/body/${parentId}` }])
    );
    (tool as any).connection.request.resolves('x'.repeat(3_000_000));
    createStub.callsFake((_connection: Connection, objectName: string, records: any[]) => {
      if (objectName === 'OmniScriptSavedSession') {
        return Promise.resolve(
          new Map(
            records.map((record) => [
              record.attributes.referenceId,
              {
                referenceId: record.attributes.referenceId,
                id: `created-${record.attributes.referenceId}`,
                success: true,
                hasErrors: false,
                errors: [],
                warnings: [],
              },
            ])
          )
        );
      }
      const referenceId = records[0].attributes.referenceId;
      return Promise.resolve(
        new Map([
          [
            referenceId,
            {
              referenceId,
              id: `created-${referenceId}`,
              success: !referenceId.startsWith('legacy-2_'),
              hasErrors: referenceId.startsWith('legacy-2_'),
              errors: referenceId.startsWith('legacy-2_') ? ['failed'] : [],
              warnings: [],
            },
          ],
        ])
      );
    });

    const [migration] = await tool.migrate();

    const attachmentCalls = createStub.getCalls().filter((call) => call.args[1] === 'Attachment');
    expect(attachmentCalls.map((call) => call.args[2][0].ParentId)).to.deep.equal([
      'created-legacy-1',
      'created-legacy-2',
    ]);
    expect(migration.results.get('legacy-1')?.success).to.be.true;
    expect(migration.results.get('legacy-2')?.errors.join(' ')).to.include('ossAttachmentUploadFailed');
  });

  it('uploads an oversized attachment with createOne', async () => {
    sandbox.stub(tool as any, 'queryOmniscriptInstance').resolves([instance(1)]);
    (tool as any).queryAttachments.resolves([
      { Id: 'oversized-attachment', Name: 'oversized.json', Body: '/body/oversized' },
    ]);
    (tool as any).connection.request.resolves('x'.repeat(5 * 1024 * 1024));
    createStub.callsFake((_connection: Connection, objectName: string) => {
      expect(objectName).to.equal('OmniScriptSavedSession');
      return Promise.resolve(
        new Map([
          [
            'legacy-1',
            {
              referenceId: 'legacy-1',
              id: 'created-legacy-1',
              success: true,
              hasErrors: false,
              errors: [],
              warnings: [],
            },
          ],
        ])
      );
    });
    createOneStub.resolves({
      referenceId: 'legacy-1_oversized-attachment',
      id: 'created-attachment',
      success: true,
      hasErrors: false,
      errors: [],
      warnings: [],
    });

    const [migration] = await tool.migrate();

    expect(createStub.getCalls().filter((call) => call.args[1] === 'Attachment')).to.have.length(0);
    expect(createOneStub.calledOnce).to.be.true;
    expect(createOneStub.firstCall.args.slice(1)).to.deep.equal([
      'Attachment',
      'legacy-1_oversized-attachment',
      {
        ParentId: 'created-legacy-1',
        Name: 'oversized.json',
        Body: Buffer.from('x'.repeat(5 * 1024 * 1024), 'utf8').toString('base64'),
      },
    ]);
    expect(migration.results.get('legacy-1')?.success).to.be.true;
  });

  it('attributes an oversized createOne failure to its source session', async () => {
    sandbox.stub(tool as any, 'queryOmniscriptInstance').resolves([instance(1), instance(2)]);
    (tool as any).queryAttachments.callsFake((parentId: string) =>
      Promise.resolve(
        parentId === 'legacy-2' ? [{ Id: 'oversized-attachment', Name: 'oversized.json', Body: '/body/oversized' }] : []
      )
    );
    (tool as any).connection.request.resolves('x'.repeat(5 * 1024 * 1024));
    createStub.callsFake((_connection: Connection, _objectName: string, records: any[]) =>
      Promise.resolve(
        new Map(
          records.map((record) => [
            record.attributes.referenceId,
            {
              referenceId: record.attributes.referenceId,
              id: `created-${record.attributes.referenceId}`,
              success: true,
              hasErrors: false,
              errors: [],
              warnings: [],
            },
          ])
        )
      )
    );
    createOneStub.resolves({
      referenceId: 'legacy-2_oversized-attachment',
      success: false,
      hasErrors: true,
      errors: ['too large'],
      warnings: [],
    });

    const [migration] = await tool.migrate();

    expect(migration.results.get('legacy-1')?.success).to.be.true;
    expect(migration.results.get('legacy-2')?.errors.join(' ')).to.include('ossAttachmentUploadFailed');
  });
});
