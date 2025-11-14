import { expect } from 'chai';
import { AssessmentInfo,
         DataRaptorAssessmentInfo,
         FlexCardAssessmentInfo,
         OmniAssessmentInfo } from '../../../../src/types';
import { MigrationTool } from '../../../../src/migrationTool';
import { ApexMigrator,
         CardMigrationTool,
         DataRaptorMigrationTool,
         OsMigrator } from '../../../../src/migrators';
import { LwcParser } from '../../../../src/parsers';

describe('MigrationTool', () => {
  let mockApexMigrator: ApexMigrator;
  let mockCardMigrationTool: CardMigrationTool;
  let mockDataRaptorMigrationTool: DataRaptorMigrationTool;
  let mockOsMigrator: OsMigrator;
  let mockLwcParser: LwcParser;

  beforeEach(() => {
    mockApexMigrator = {} as ApexMigrator;
    mockCardMigrationTool = {} as CardMigrationTool;
    mockDataRaptorMigrationTool = {} as DataRaptorMigrationTool;
    mockOsMigrator = {} as OsMigrator;
    mockLwcParser = {} as LwcParser;
  });

  it('should identify no duplicate components after successful run of the migration tool', async () => {
    const mockNamespace = 'mockNamespace';
    const mockConn = { instanceUrl: 'mockInstanceUrl' };
    const mockLogger = { info: () => {} };
    const mockMessages = {};
    const mockUx = { log: () => {} };
    const mockAllVersions = {};
    const mockDataRaptorAssessmentInfos: DataRaptorAssessmentInfo[] = [
      { name: 'mockDataRaptor1', type: 'mockType1' },
      { name: 'mockDataRaptor2', type: 'mockType2' },
    ];
    const mockFlexCardAssessmentInfos: FlexCardAssessmentInfo[] = [
      { name: 'mockFlexCard1', type: 'mockType1' },
      { name: 'mockFlexCard2', type: 'mockType2' },
    ];
    const mockOmniAssessmentInfo: OmniAssessmentInfo = {
      name: 'mockOmni',
      type: 'mockType',
    };

    mockApexMigrator.assess = () => [];
    mockCardMigrationTool.assess = () => mockFlexCardAssessmentInfos;
    mockDataRaptorMigrationTool.assess = () => mockDataRaptorAssessmentInfos;
    mockOsMigrator.assess = () => mockOmniAssessmentInfo;

    const migrationTool = new MigrationTool(
      mockNamespace,
      mockConn,
      mockLogger,
      mockMessages,
      mockUx,
      mockAllVersions,
      mockApexMigrator,
      mockCardMigrationTool,
      mockDataRaptorMigrationTool,
      mockOsMigrator,
      mockLwcParser
    );

    const assessmentInfo: AssessmentInfo = await migrationTool.run();

    expect(assessmentInfo).to.deep.equal({
      apexAssessmentInfos: [],
      dataRaptorAssessmentInfos: mockDataRaptorAssessmentInfos,
      flexCardAssessmentInfos: mockFlexCardAssessmentInfos,
      omniAssessmentInfo: mockOmniAssessmentInfo,
    });
  });

  it('should identify that the migration should restart from the point of failure if any in between', async () => {
    const mockNamespace = 'mockNamespace';
    const mockConn = { instanceUrl: 'mockInstanceUrl' };
    const mockLogger = { info: () => {} };
    const mockMessages = {};
    const mockUx = { log: () => {} };
    const mockAllVersions = {};
    const mockDataRaptorAssessmentInfos: DataRaptorAssessmentInfo[] = [
      { name: 'mockDataRaptor1', type: 'mockType1' },
      { name: 'mockDataRaptor2', type: 'mockType2' },
    ];
    const mockFlexCardAssessmentInfos: FlexCardAssessmentInfo[] = [
      { name: 'mockFlexCard1', type: 'mockType1' },
      { name: 'mockFlexCard2', type: 'mockType2' },
    ];
    const mockOmniAssessmentInfo: OmniAssessmentInfo = {
      name: 'mockOmni',
      type: 'mockType',
    };

    let failed = false;
    let callCount = 0;

    mockApexMigrator.assess = () => {
      callCount++;
      if (callCount === 2) {
        failed = true;
        throw new Error('Mock Apex migration failed');
      }
      return [];
    };

    mockCardMigrationTool.assess = () => {
      if (failed) {
        throw new Error('Mock FlexCard migration failed');
      }
      return mockFlexCardAssessmentInfos;
    };

    mockDataRaptorMigrationTool.assess = () => {
      if (failed) {
        throw new Error('Mock DataRaptor migration failed');
      }
      return mockDataRaptorAssessmentInfos;
    };

    mockOsMigrator.assess = () => {
      if (failed) {
        throw new Error('Mock Omni migration failed');
      }
      return mockOmniAssessmentInfo;
    };

    const migrationTool = new MigrationTool(
      mockNamespace,
      mockConn,
      mockLogger,
      mockMessages,
      mockUx,
      mockAllVersions,
      mockApexMigrator,
      mockCardMigrationTool,
      mockDataRaptorMigrationTool,
      mockOsMigrator,
      mockLwcParser
    );

    try {
      await migrationTool.run();
    } catch (error) {
      expect(error.message).to.equal('Mock Apex migration failed');
    }
  });
});
