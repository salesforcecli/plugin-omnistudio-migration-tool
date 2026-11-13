/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable camelcase */
import * as http from 'http';
import { AddressInfo } from 'net';
import { expect } from 'chai';
import { Connection as JsforceConnection } from '@jsforce/jsforce-node';
import { setDefaults as setJsforceRequestDefaults } from '@jsforce/jsforce-node/lib/request';
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

  // Mirrors jsforce: raw bytes as base64 only when requested, otherwise a JSON content type is parsed into an
  // object and any other body is decoded as UTF-8 text.
  const jsforceBody = (bytes: Buffer, contentType: string | null, options?: { encoding?: string }): unknown => {
    if (options?.encoding === 'base64') return bytes.toString('base64');
    if (contentType === 'application/json' && bytes.length > 0) return JSON.parse(bytes.toString('utf8'));
    return bytes.toString('utf8');
  };

  const stubAttachmentBody = (bytes: Buffer, contentType = 'application/octet-stream'): void => {
    (tool as any).connection.request.callsFake((_request: unknown, options?: { encoding?: string }) =>
      Promise.resolve(jsforceBody(bytes, contentType, options))
    );
  };

  const successfulCreate = (_connection: Connection, objectName: string, records: any[]): Promise<Map<string, any>> => {
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
  };

  // W-24296247: ManagedPkgSessKey links the migrated session back to the package session
  it('sets ManagedPkgSessKey to the source OmniScriptInstance Id on every migrated saved session', async () => {
    sandbox.stub(tool as any, 'queryOmniscriptInstance').resolves([instance(0), instance(1)]);
    createStub.callsFake(successfulCreate);

    await tool.migrate();

    const savedSessionCall = createStub.getCalls().find((call) => call.args[1] === 'OmniScriptSavedSession');
    expect(savedSessionCall.args[2].map((record: any) => record.ManagedPkgSessKey)).to.deep.equal([
      'legacy-0',
      'legacy-1',
    ]);
  });

  // W-24296247: the field exists in 264+, but the running user may have no field-level security on it
  it('reports an error instead of silently skipping when ManagedPkgSessKey exists but is not accessible', async () => {
    (tool as any).hasStandardFieldPackageSavedSessionId.resolves(false);
    sandbox.stub(tool as any, 'isManagedPkgSessKeyDefinedInOrg').resolves(true);
    const queryStub = sandbox.stub(tool as any, 'queryOmniscriptInstance').resolves([instance(0)]);

    const results = await tool.migrate();

    expect(results).to.have.length(1);
    expect(results[0].errors).to.deep.equal(['ossManagedPkgSessKeyNoAccess']);
    expect(queryStub.called).to.be.false;
    expect(createStub.called).to.be.false;
  });

  it('skips quietly when ManagedPkgSessKey does not exist in the org (262 and earlier)', async () => {
    (tool as any).hasStandardFieldPackageSavedSessionId.resolves(false);
    sandbox.stub(tool as any, 'isManagedPkgSessKeyDefinedInOrg').resolves(false);
    const queryStub = sandbox.stub(tool as any, 'queryOmniscriptInstance').resolves([instance(0)]);

    const results = await tool.migrate();

    expect(results).to.deep.equal([]);
    expect(queryStub.called).to.be.false;
  });

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
      { Id: 'attachment-1', Name: 'one.json', Body: '/body/1', BodyLength: 4, ContentType: 'application/json' },
    ]);
    stubAttachmentBody(Buffer.from('body', 'utf8'));
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
    stubAttachmentBody(Buffer.from('body', 'utf8'));
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
    stubAttachmentBody(Buffer.from('body', 'utf8'));

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
    stubAttachmentBody(Buffer.from('x'.repeat(3_000_000), 'utf8'));
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
    stubAttachmentBody(Buffer.from('body', 'utf8'));
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
    stubAttachmentBody(Buffer.from('x'.repeat(3_000_000), 'utf8'));
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
    stubAttachmentBody(Buffer.from('x'.repeat(5 * 1024 * 1024), 'utf8'));
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
    stubAttachmentBody(Buffer.from('x'.repeat(5 * 1024 * 1024), 'utf8'));
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

  describe('attachment download', () => {
    type SourceAttachment = {
      id: string;
      name: string;
      bytes: Buffer;
      contentType: string | null;
      bodyLength?: number | null;
    };

    const uploadedAttachments = (): any[] =>
      createStub
        .getCalls()
        .filter((call) => call.args[1] === 'Attachment')
        .flatMap((call) => call.args[2]);

    const uploadedBytes = (name: string): Buffer => {
      const record = uploadedAttachments().find((attachment) => attachment.Name === name);
      expect(record, `${name} was not uploaded`).to.exist;
      return Buffer.from(record.Body, 'base64');
    };

    // Serves each attachment the way jsforce does (see jsforceBody)
    const givenAttachments = (attachments: SourceAttachment[]): void => {
      (tool as any).queryAttachments.resolves(
        attachments.map((attachment) => ({
          Id: attachment.id,
          Name: attachment.name,
          Body: `/sobjects/Attachment/${attachment.id}/Body`,
          BodyLength: attachment.bodyLength === undefined ? attachment.bytes.length : attachment.bodyLength,
          ContentType: attachment.contentType,
        }))
      );
      (tool as any).connection.request.callsFake((request: { url: string }, options?: { encoding?: string }) => {
        const attachment = attachments.find((candidate) => request.url.includes(candidate.id));
        if (!attachment) return Promise.reject(new Error(`unexpected request ${request.url}`));
        return Promise.resolve(jsforceBody(attachment.bytes, attachment.contentType, options));
      });
    };

    beforeEach(() => {
      sandbox.stub(tool as any, 'queryOmniscriptInstance').resolves([instance(1)]);
      createStub.callsFake((_connection: Connection, _objectName: string, records: any[]) =>
        Promise.resolve(
          new Map(
            records.map((record) => [
              record.attributes.referenceId,
              {
                referenceId: record.attributes.referenceId,
                id: `created-${record.attributes.referenceId}`,
                success: true,
              },
            ])
          )
        )
      );
    });

    it('carries the saved answers and files map over to the new session', async () => {
      const dataJson = Buffer.from(JSON.stringify({ Step1: { Text1: 'another saved session' } }));
      const filesMap = Buffer.from(JSON.stringify({ File1: [{ data: '069000000000001', filename: 'id.pdf' }] }));
      givenAttachments([
        { id: '00P000000000001', name: 'OmniScriptDataJSON.json', bytes: dataJson, contentType: 'application/json' },
        { id: '00P000000000002', name: 'OmniScriptFilesMap.json', bytes: filesMap, contentType: 'application/json' },
      ]);

      const [migration] = await tool.migrate();

      expect(migration.results.get('legacy-1')?.errors).to.deep.equal([]);
      expect(uploadedBytes('OmniScriptDataJSON.json').equals(dataJson)).to.be.true;
      expect(uploadedBytes('OmniScriptFilesMap.json').equals(filesMap)).to.be.true;
      expect(uploadedAttachments().every((attachment) => attachment.ContentType === 'application/json')).to.be.true;
    });

    it('holds back a truncated download but still uploads the rest of the session', async () => {
      const fullJson = Buffer.from(JSON.stringify({ sInstanceId: 'legacy-1', lwcName: 'c:sflSflEnglish' }));
      const dataJson = Buffer.from(JSON.stringify({ Step1: { Text1: 'kept' } }));
      givenAttachments([
        {
          id: '00P000000000001',
          name: 'OmniScriptFullJSON.json',
          bytes: fullJson.subarray(0, 10),
          contentType: 'application/octet-stream',
          bodyLength: fullJson.length,
        },
        { id: '00P000000000002', name: 'OmniScriptDataJSON.json', bytes: dataJson, contentType: 'application/json' },
      ]);

      const [migration] = await tool.migrate();

      expect(uploadedAttachments().map((attachment) => attachment.Name)).to.deep.equal(['OmniScriptDataJSON.json']);
      expect(uploadedBytes('OmniScriptDataJSON.json').equals(dataJson)).to.be.true;
      const errors = migration.results.get('legacy-1')?.errors ?? [];
      expect(errors).to.have.lengthOf(1);
      expect(errors[0]).to.include('ossAttachmentSizeMismatch');
      expect(
        (tool as any).messages.getMessage.calledWith('ossAttachmentSizeMismatch', [
          'OmniScriptFullJSON.json',
          '00P000000000001',
          fullJson.length,
          10,
        ])
      ).to.be.true;
    });

    it('holds back a download with more bytes than its source', async () => {
      const dataJson = Buffer.from(JSON.stringify({ Step1: { Text1: 'saved answer' } }));
      givenAttachments([
        {
          id: '00P000000000001',
          name: 'OmniScriptDataJSON.json',
          bytes: dataJson,
          contentType: 'application/json',
          bodyLength: 5,
        },
      ]);

      const [migration] = await tool.migrate();

      expect(uploadedAttachments()).to.be.empty;
      const errors = migration.results.get('legacy-1')?.errors ?? [];
      expect(errors).to.have.lengthOf(1);
      expect(errors[0]).to.include('ossAttachmentSizeMismatch');
    });

    it('uploads an empty attachment as an empty body', async () => {
      givenAttachments([
        { id: '00P000000000001', name: 'empty.txt', bytes: Buffer.alloc(0), contentType: 'text/plain', bodyLength: 0 },
      ]);

      const [migration] = await tool.migrate();

      expect(migration.results.get('legacy-1')?.errors).to.deep.equal([]);
      expect(uploadedAttachments().map((attachment) => attachment.Body)).to.deep.equal(['']);
    });

    it('treats a null response as an empty body when the source attachment is empty', async () => {
      givenAttachments([
        { id: '00P000000000001', name: 'empty.txt', bytes: Buffer.alloc(0), contentType: 'text/plain', bodyLength: 0 },
      ]);
      (tool as any).connection.request.resolves(null);

      const [download] = await (tool as any).downloadAttachments(await (tool as any).queryAttachments('legacy-1'));

      expect(download.body).to.equal('');
      expect(download.errors).to.deep.equal([]);
    });

    it('treats no content as an empty body only when the source attachment is empty', async () => {
      givenAttachments([
        { id: '00P000000000001', name: 'empty.txt', bytes: Buffer.alloc(0), contentType: 'text/plain', bodyLength: 0 },
        { id: '00P000000000002', name: 'notes.txt', bytes: Buffer.from('notes'), contentType: 'text/plain' },
      ]);
      (tool as any).connection.request.resolves(undefined);

      const [download, missing] = await (tool as any).downloadAttachments(
        await (tool as any).queryAttachments('legacy-1')
      );

      expect(download).to.include({ body: '' });
      expect(download.errors).to.deep.equal([]);
      expect(missing.body).to.equal('');
      expect(missing.errors).to.have.lengthOf(1);
      expect(missing.errors[0]).to.include('ossAttachmentUnexpectedResponse');
    });

    it('uploads an attachment with no ContentType or BodyLength without inventing either', async () => {
      const upload = Buffer.from('scanned driver licence');
      givenAttachments([
        { id: '069000000000001', name: '069000000000001', bytes: upload, contentType: null, bodyLength: null },
      ]);

      const [migration] = await tool.migrate();

      expect(migration.results.get('legacy-1')?.errors).to.deep.equal([]);
      expect(uploadedBytes('069000000000001').equals(upload)).to.be.true;
      expect(uploadedAttachments()[0]).to.not.have.property('ContentType');
      expect((Logger.warn as sinon.SinonStub).calledWith('ossAttachmentSizeUnverified')).to.be.true;
    });

    it('keeps bytes that are not valid UTF-8 intact', async () => {
      // PNG signature followed by bytes that a UTF-8 round trip would replace with U+FFFD
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe, 0x80, 0xc3, 0x28]);
      givenAttachments([{ id: '069000000000001', name: 'photo.png', bytes: png, contentType: 'image/png' }]);

      const [migration] = await tool.migrate();

      expect(migration.results.get('legacy-1')?.errors).to.deep.equal([]);
      expect(uploadedBytes('photo.png').equals(png)).to.be.true;
    });

    it('compares sizes in bytes, so accented and emoji answers are not flagged as truncated', async () => {
      const dataJson = Buffer.from(JSON.stringify({ Step1: { Name: 'José Müller', City: '東京', Note: '👍' } }));
      expect(dataJson.length).to.be.greaterThan(dataJson.toString('utf8').length);
      givenAttachments([
        { id: '00P000000000001', name: 'OmniScriptDataJSON.json', bytes: dataJson, contentType: 'application/json' },
      ]);

      const [migration] = await tool.migrate();

      expect(migration.results.get('legacy-1')?.errors).to.deep.equal([]);
      expect(uploadedBytes('OmniScriptDataJSON.json').toString('utf8')).to.equal(dataJson.toString('utf8'));
    });

    it('reports an error instead of uploading an empty body when the response is not base64 text', async () => {
      // As if jsforce ignored the encoding option and parsed the JSON, with no BodyLength to catch it
      const dataJson = Buffer.from(JSON.stringify({ Step1: { Text1: 'saved answer' } }));
      givenAttachments([
        {
          id: '00P000000000001',
          name: 'OmniScriptDataJSON.json',
          bytes: dataJson,
          contentType: 'application/json',
          bodyLength: null,
        },
      ]);
      (tool as any).connection.request.resolves(JSON.parse(dataJson.toString('utf8')));

      const [migration] = await tool.migrate();

      expect(uploadedAttachments()).to.be.empty;
      const errors = migration.results.get('legacy-1')?.errors ?? [];
      expect(errors).to.have.lengthOf(1);
      expect(errors[0]).to.include('ossAttachmentUnexpectedResponse');
    });

    it('never returns a body for an attachment that failed its checks', async () => {
      const fullJson = Buffer.from(JSON.stringify({ sInstanceId: 'legacy-1' }));
      givenAttachments([
        {
          id: '00P000000000001',
          name: 'OmniScriptFullJSON.json',
          bytes: fullJson.subarray(0, 10),
          contentType: 'application/octet-stream',
          bodyLength: fullJson.length,
        },
      ]);

      const [download] = await (tool as any).downloadAttachments(await (tool as any).queryAttachments('legacy-1'));

      expect(download.errors).to.have.lengthOf(1);
      expect(download.body).to.equal('');
    });

    it('never returns a body for a response that is not base64 text or a failed request', async () => {
      const dataJson = Buffer.from(JSON.stringify({ Step1: { Text1: 'saved answer' } }));
      givenAttachments([
        { id: '00P000000000001', name: 'OmniScriptDataJSON.json', bytes: dataJson, contentType: 'application/json' },
      ]);
      const attachments = await (tool as any).queryAttachments('legacy-1');

      (tool as any).connection.request.resolves(JSON.parse(dataJson.toString('utf8')));
      const [unexpected] = await (tool as any).downloadAttachments(attachments);
      (tool as any).connection.request.rejects(new Error('socket hang up'));
      const [failed] = await (tool as any).downloadAttachments(attachments);

      expect(unexpected.body).to.equal('');
      expect(unexpected.errors).to.have.lengthOf(1);
      expect(failed.body).to.equal('');
      expect(failed.errors).to.have.lengthOf(1);
      expect(failed.errors[0]).to.include('ossAttachmentDownloadFailed');
    });
  });
});

// Sends real requests through the installed jsforce to a local server, so a jsforce version that stops honouring
// the responseType or encoding options fails here, unlike the stubbed tests above.
describe('OmniScriptInstanceMigrationTool - attachment download through jsforce', () => {
  let sandbox: sinon.SinonSandbox;
  let server: http.Server;
  let tool: OmniScriptInstanceMigrationTool;
  const served = new Map<string, { bytes: Buffer; contentType: string; status?: number }>();
  const notFound = Buffer.from(
    JSON.stringify([{ errorCode: 'NOT_FOUND', message: 'The requested resource does not exist' }])
  );

  // jsforce sends every request through the proxy from the environment, which would not reach this local server.
  // jsforce keeps its request defaults private, so they can't be captured. after() restores them with the same
  // expression jsforce runs when it loads (lib/transport.js). Only one jsforce is installed, and it is the one
  // @salesforce/core uses, so these tests run the production code path.
  const jsforceRequestDefaults = (httpProxy?: string): void =>
    setJsforceRequestDefaults({
      httpProxy,
      timeout: process.env.HTTP_TIMEOUT ? parseInt(process.env.HTTP_TIMEOUT, 10) : undefined,
      followRedirect: true,
    });

  before(async () => {
    jsforceRequestDefaults(undefined);
    server = http.createServer((request, response) => {
      const body = served.get(request.url ?? '') ?? { bytes: notFound, contentType: 'application/json', status: 404 };
      if (body.status === 204) {
        response.writeHead(204).end();
        return;
      }
      response.writeHead(body.status ?? 200, { 'Content-Type': body.contentType }).end(body.bytes);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  });

  after(async () => {
    jsforceRequestDefaults(
      process.env.https_proxy ?? process.env.http_proxy ?? process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY
    );
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(dataModelService, 'isStandardDataModel').returns(false);
    sandbox.stub(dataModelService, 'isStandardDataModelWithMetadataAPIEnabled').returns(false);
    sandbox.stub(Logger, 'logVerbose');
    sandbox.stub(Logger, 'error');
    sandbox.stub(Logger, 'warn');
    served.clear();

    const { port } = server.address() as AddressInfo;
    const connection = new JsforceConnection({
      instanceUrl: `http://127.0.0.1:${port}`,
      accessToken: 'test-token',
      version: '62.0',
    });
    const messages = {
      getMessage: (key: string, tokens: unknown[] = []) => `${key} ${JSON.stringify(tokens)}`,
    } as unknown as Messages<string>;
    tool = new OmniScriptInstanceMigrationTool(
      'vlocity_ins',
      connection as unknown as Connection,
      {} as Logger,
      messages,
      {} as Ux
    );
  });

  afterEach(() => sandbox.restore());

  const attachment = (id: string, bytes: Buffer, contentType: string): any => {
    const path = `/services/data/v62.0/sobjects/Attachment/${id}/Body`;
    served.set(path, { bytes, contentType });
    return { Id: id, Name: id, Body: path, BodyLength: bytes.length, ContentType: contentType };
  };

  it('returns the exact bytes of JSON, text and binary attachments', async () => {
    const dataJson = Buffer.from(JSON.stringify({ Step1: { Name: 'José Müller', Note: '👍' } }));
    const text = Buffer.from('069000000000001AAA');
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe, 0x80, 0xc3, 0x28]);

    const downloads = await (tool as any).downloadAttachments([
      attachment('00P000000000001', dataJson, 'application/json;charset=UTF-8'),
      attachment('00P000000000002', text, 'text/plain'),
      attachment('00P000000000003', png, 'image/png'),
    ]);

    expect(downloads.map((download: any) => download.errors)).to.deep.equal([[], [], []]);
    expect(Buffer.from(downloads[0].body, 'base64').equals(dataJson)).to.be.true;
    expect(Buffer.from(downloads[1].body, 'base64').equals(text)).to.be.true;
    expect(Buffer.from(downloads[2].body, 'base64').equals(png)).to.be.true;
  });

  it('returns the exact bytes of CSV and XML attachments, which jsforce would otherwise parse', async () => {
    const csv = Buffer.from('Name,City\nJosé,東京\n');
    const xml = Buffer.from('<?xml version="1.0"?><answers><Text1>saved</Text1></answers>');
    const bodies = [csv, xml, xml];

    const downloads = await (tool as any).downloadAttachments([
      attachment('00P000000000001', csv, 'text/csv'),
      attachment('00P000000000002', xml, 'application/xml'),
      attachment('00P000000000003', xml, 'text/xml; charset=utf-8'),
    ]);

    expect(downloads.map((download: any) => download.errors)).to.deep.equal([[], [], []]);
    downloads.forEach(
      (download: any, index: number) => expect(Buffer.from(download.body, 'base64').equals(bodies[index])).to.be.true
    );
  });

  it('copies an empty attachment that comes back as 204 No Content', async () => {
    const path = '/services/data/v62.0/sobjects/Attachment/00P000000000008/Body';
    served.set(path, { bytes: Buffer.alloc(0), contentType: 'text/plain', status: 204 });

    const [download] = await (tool as any).downloadAttachments([
      { Id: '00P000000000008', Name: 'empty.txt', Body: path, BodyLength: 0, ContentType: 'text/plain' },
    ]);

    expect(download.errors).to.deep.equal([]);
    expect(download.body).to.equal('');
  });

  it('does not decode a plain-text error message that only uses base64 characters', () => {
    const error = Object.assign(new Error('Forbidden'), { errorCode: 'ERROR_HTTP_403' });

    expect((tool as any).getDownloadErrorMessage(error)).to.equal('Forbidden');
  });

  it('reports the Salesforce error, not base64 text, when an attachment download fails', async () => {
    const path = '/services/data/v62.0/sobjects/Attachment/00P000000000009/Body';

    const [download] = await (tool as any).downloadAttachments([
      { Id: '00P000000000009', Name: 'deleted.json', Body: path, BodyLength: 10, ContentType: 'application/json' },
    ]);

    expect(download.body).to.equal('');
    expect(download.errors).to.deep.equal([
      `ossAttachmentDownloadFailed ${JSON.stringify([
        path,
        JSON.stringify('NOT_FOUND: The requested resource does not exist'),
      ])}`,
    ]);
  });
});
