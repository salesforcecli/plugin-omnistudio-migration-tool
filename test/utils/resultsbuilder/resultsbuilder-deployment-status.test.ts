/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { expect } from 'chai';
import sinon = require('sinon');
import { Messages } from '@salesforce/core';
import { ResultsBuilder } from '../../../src/utils/resultsbuilder/index';
import {
  ExperienceSiteAssessmentInfo,
  ExperienceSiteAssessmentPageInfo,
  FlexiPageAssessmentInfo,
  LWCAssessmentInfo,
} from '../../../src/utils/interfaces';
import { SummaryItemDetailParam } from '../../../src/utils/reportGenerator/reportInterfaces';

describe('ResultsBuilder deployment-status helpers', () => {
  let sandbox: sinon.SinonSandbox;
  let messagesStub: Messages<string>;

  const RB = ResultsBuilder as any;

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    messagesStub = {
      getMessage: sandbox.stub().callsFake((key: string) => {
        if (key === 'manualDeploymentNeeded') return 'Manual deployment needed';
        return key;
      }),
    } as unknown as Messages<string>;

    RB.deploymentFailed = false;
  });

  afterEach(() => {
    RB.deploymentFailed = false;
    sandbox.restore();
  });

  describe('isManualDeploymentNeeded', () => {
    it('should return false when deploymentFailed is false', () => {
      RB.deploymentFailed = false;
      expect(RB.isManualDeploymentNeeded('Successfully migrated')).to.be.false;
    });

    it('should return true when deploymentFailed is true and status is Successfully migrated', () => {
      RB.deploymentFailed = true;
      expect(RB.isManualDeploymentNeeded('Successfully migrated')).to.be.true;
    });

    it('should return false when deploymentFailed is true but status is not Successfully migrated', () => {
      RB.deploymentFailed = true;
      expect(RB.isManualDeploymentNeeded('Failed')).to.be.false;
      expect(RB.isManualDeploymentNeeded('Skipped')).to.be.false;
    });
  });

  describe('resolveDisplayStatus', () => {
    it('should return original status when deployment did not fail', () => {
      RB.deploymentFailed = false;
      expect(RB.resolveDisplayStatus('Successfully migrated', messagesStub)).to.equal('Successfully migrated');
    });

    it('should return manualDeploymentNeeded message when deployment failed and status is Successfully migrated', () => {
      RB.deploymentFailed = true;
      expect(RB.resolveDisplayStatus('Successfully migrated', messagesStub)).to.equal('Manual deployment needed');
    });

    it('should return original status when deployment failed but status is not Successfully migrated', () => {
      RB.deploymentFailed = true;
      expect(RB.resolveDisplayStatus('Failed', messagesStub)).to.equal('Failed');
    });
  });

  describe('resolveStatusClass', () => {
    it('should return text-success for Successfully migrated when deployment did not fail', () => {
      RB.deploymentFailed = false;
      expect(RB.resolveStatusClass('Successfully migrated')).to.equal('text-success');
    });

    it('should return text-error for non-success statuses', () => {
      RB.deploymentFailed = false;
      expect(RB.resolveStatusClass('Failed')).to.equal('text-error');
      expect(RB.resolveStatusClass('Skipped')).to.equal('text-error');
    });

    it('should return text-error when deployment failed and status is Successfully migrated', () => {
      RB.deploymentFailed = true;
      expect(RB.resolveStatusClass('Successfully migrated')).to.equal('text-error');
    });
  });

  describe('countStatusesFromItems', () => {
    it('should count statuses correctly when deployment did not fail', () => {
      RB.deploymentFailed = false;
      const statuses = ['Successfully migrated', 'Failed', 'Skipped', 'Successfully migrated', 'Failed'];
      const counts = RB.countStatusesFromItems(statuses);

      expect(counts.completed).to.equal(2);
      expect(counts.failed).to.equal(2);
      expect(counts.skipped).to.equal(1);
      expect(counts.manualDeploymentNeeded).to.equal(0);
    });

    it('should classify Successfully migrated as manualDeploymentNeeded when deployment failed', () => {
      RB.deploymentFailed = true;
      const statuses = ['Successfully migrated', 'Failed', 'Skipped', 'Successfully migrated'];
      const counts = RB.countStatusesFromItems(statuses);

      expect(counts.completed).to.equal(0);
      expect(counts.manualDeploymentNeeded).to.equal(2);
      expect(counts.failed).to.equal(1);
      expect(counts.skipped).to.equal(1);
    });

    it('should return all zeros for empty array', () => {
      const counts = RB.countStatusesFromItems([]);
      expect(counts.completed).to.equal(0);
      expect(counts.manualDeploymentNeeded).to.equal(0);
      expect(counts.skipped).to.equal(0);
      expect(counts.failed).to.equal(0);
    });
  });

  describe('buildStatusSummary', () => {
    it('should return summary without Manual deployment needed when count is zero', () => {
      const result: SummaryItemDetailParam[] = RB.buildStatusSummary({
        completed: 5,
        manualDeploymentNeeded: 0,
        skipped: 1,
        failed: 2,
      });

      expect(result).to.have.length(3);
      expect(result[0].name).to.equal('Successfully migrated');
      expect(result[0].count).to.equal(5);
      expect(result[0].cssClass).to.equal('text-success');
      expect(result[1].name).to.equal('Skipped');
      expect(result[1].count).to.equal(1);
      expect(result[2].name).to.equal('Failed');
      expect(result[2].count).to.equal(2);
    });

    it('should include Manual deployment needed when count is greater than zero', () => {
      const result: SummaryItemDetailParam[] = RB.buildStatusSummary({
        completed: 0,
        manualDeploymentNeeded: 3,
        skipped: 1,
        failed: 1,
      });

      expect(result).to.have.length(4);
      expect(result[0].name).to.equal('Successfully migrated');
      expect(result[0].count).to.equal(0);
      expect(result[1].name).to.equal('Manual deployment needed');
      expect(result[1].count).to.equal(3);
      expect(result[1].cssClass).to.equal('text-error');
      expect(result[2].name).to.equal('Skipped');
      expect(result[2].count).to.equal(1);
      expect(result[3].name).to.equal('Failed');
      expect(result[3].count).to.equal(1);
    });
  });

  describe('getDifferentStatusDataForFlexipage', () => {
    it('should count flexipage statuses correctly', () => {
      RB.deploymentFailed = false;
      const data: FlexiPageAssessmentInfo[] = [
        { name: 'P1', path: '/p1', diff: '', errors: [], status: 'Successfully migrated' },
        { name: 'P2', path: '/p2', diff: '', errors: [], status: 'Skipped' },
        { name: 'P3', path: '/p3', diff: '', errors: ['err'], status: 'Failed' },
      ];

      const result: SummaryItemDetailParam[] = RB.getDifferentStatusDataForFlexipage(data);
      expect(result).to.have.length(3);
      expect(result[0].name).to.equal('Successfully migrated');
      expect(result[0].count).to.equal(1);
      expect(result[1].name).to.equal('Skipped');
      expect(result[1].count).to.equal(1);
      expect(result[2].name).to.equal('Failed');
      expect(result[2].count).to.equal(1);
    });

    it('should reflect manualDeploymentNeeded when deployment failed', () => {
      RB.deploymentFailed = true;
      const data: FlexiPageAssessmentInfo[] = [
        { name: 'P1', path: '/p1', diff: '', errors: [], status: 'Successfully migrated' },
        { name: 'P2', path: '/p2', diff: '', errors: [], status: 'Successfully migrated' },
      ];

      const result: SummaryItemDetailParam[] = RB.getDifferentStatusDataForFlexipage(data);
      expect(result).to.have.length(4);
      expect(result[0].name).to.equal('Successfully migrated');
      expect(result[0].count).to.equal(0);
      expect(result[1].name).to.equal('Manual deployment needed');
      expect(result[1].count).to.equal(2);
    });
  });

  describe('getDifferentStatusDataForLwc', () => {
    it('should derive status from errors array', () => {
      RB.deploymentFailed = false;
      const data: LWCAssessmentInfo[] = [
        { name: 'C1', changeInfos: [], errors: [], warnings: [] },
        { name: 'C2', changeInfos: [], errors: ['compilation error'], warnings: [] },
      ];

      const result: SummaryItemDetailParam[] = RB.getDifferentStatusDataForLwc(data);
      expect(result[0].name).to.equal('Successfully migrated');
      expect(result[0].count).to.equal(1);
      const failed = result.find((r: SummaryItemDetailParam) => r.name === 'Failed');
      expect(failed).to.exist;
      expect(failed).to.have.property('count', 1);
    });
  });

  describe('getDifferentStatusDataForExperienceSites', () => {
    it('should count nested page statuses correctly', () => {
      RB.deploymentFailed = false;
      const data: ExperienceSiteAssessmentInfo[] = [
        {
          experienceBundleName: 'Site1',
          experienceSiteAssessmentPageInfos: [
            { name: 'page1', status: 'Successfully migrated' } as ExperienceSiteAssessmentPageInfo,
            { name: 'page2', status: 'Failed' } as ExperienceSiteAssessmentPageInfo,
          ],
        },
        {
          experienceBundleName: 'Site2',
          experienceSiteAssessmentPageInfos: [{ name: 'page3', status: 'Skipped' } as ExperienceSiteAssessmentPageInfo],
        },
      ];

      const result: SummaryItemDetailParam[] = RB.getDifferentStatusDataForExperienceSites(data);
      expect(result).to.have.length(3);
      expect(result[0].name).to.equal('Successfully migrated');
      expect(result[0].count).to.equal(1);
      expect(result[1].name).to.equal('Skipped');
      expect(result[1].count).to.equal(1);
      expect(result[2].name).to.equal('Failed');
      expect(result[2].count).to.equal(1);
    });
  });
});
