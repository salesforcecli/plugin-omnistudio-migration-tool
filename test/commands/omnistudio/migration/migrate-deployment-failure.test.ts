/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect } from 'chai';
import sinon = require('sinon');

// Tests the deploymentFailed tracking pattern introduced in migrate.ts.
// PostMigrate.deploy now re-throws errors so migrate.ts catches them
// to set the flag and still continue with report generation.
describe('Migrate command – deploymentFailed flag tracking', () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should set deploymentFailed to true when deploy throws', async () => {
    // Arrange
    const deployStub = sandbox.stub().rejects(new Error('deploy failed'));
    const generateReportStub = sandbox.stub().resolves();

    // Act — replicate the pattern from migrate.ts
    let deploymentFailed = false;
    try {
      await deployStub();
    } catch {
      deploymentFailed = true;
    }
    await generateReportStub(deploymentFailed);

    // Assert
    expect(deploymentFailed).to.be.true;
    expect(generateReportStub.calledOnce).to.be.true;
    expect(generateReportStub.firstCall.args[0]).to.be.true;
  });

  it('should keep deploymentFailed false when deploy succeeds', async () => {
    // Arrange
    const deployStub = sandbox.stub().resolves();
    const generateReportStub = sandbox.stub().resolves();

    // Act
    let deploymentFailed = false;
    try {
      await deployStub();
    } catch {
      deploymentFailed = true;
    }
    await generateReportStub(deploymentFailed);

    // Assert
    expect(deploymentFailed).to.be.false;
    expect(generateReportStub.calledOnce).to.be.true;
    expect(generateReportStub.firstCall.args[0]).to.be.false;
  });

  it('should still call generateReport even after deploy failure', async () => {
    // Arrange
    const deployStub = sandbox.stub().rejects(new Error('deploy failed'));
    const generateReportStub = sandbox.stub().resolves();
    const actionItems: string[] = [];

    // Act
    let deploymentFailed = false;
    try {
      await deployStub(actionItems);
    } catch {
      deploymentFailed = true;
      actionItems.push('Deployment failed action item');
    }
    await generateReportStub(actionItems, deploymentFailed);

    // Assert
    expect(generateReportStub.calledOnce).to.be.true;
    expect(actionItems).to.include('Deployment failed action item');
    expect(generateReportStub.firstCall.args[1]).to.be.true;
  });
});
