/* eslint-disable */

import { Connection, Messages } from '@salesforce/core';
import { QueryTools } from '../query';
import { Logger } from '../logger';
import { OrgPreferences } from '../orgPreferences';
import { OmnistudioSettingsPrefManager } from '../OmnistudioSettingsPrefManager';
import { Constants } from '../constants/stringContants';

// Load messages
const messages = Messages.loadMessages('@salesforce/plugin-omnistudio-migration-tool', 'migrate');

interface InstalledPackage {
  MajorVersion: number;
  MinorVersion: number;
  NamespacePrefix: string;
  Name: string;
}

interface OrgDetails {
  Name: string;
  Id: string;
}

export interface OmnistudioOrgDetails {
  packageDetails: PackageDetail;
  omniStudioOrgPermissionEnabled: boolean;
  orgDetails: OrgDetails;
  dataModel: string;
  hasValidNamespace: boolean;
  rollbackFlags?: string[];
  isFoundationPackage: boolean;
  isOmnistudioMetadataAPIEnabled: boolean;
  isDRVersioningEnabled: boolean;
}

export interface PackageDetail {
  version: string;
  namespace: string;
}

export class OrgUtils {
  private static readonly namespaces = new Set<string>([
    'omnistudio', // Adding now as this will also be supported
    'as_dev_01',
    'as_dev_02',
    'as_dev_03',
    'as_dev_04',
    'as_dev_05',
    'as_dev_06',
    'as_dev_07',
    'as_dev_08',
    'as_dev_09',
    'as_dev_10',
    'as_dev_11',
    'as_dev_12',
    'as_dev_13',
    'as_dev_14',
    'as_dev_15',
    'as_dev_16',
    'as_dev_17',
    'as_dev_18',
    'as_dev_19',
    'as_dev_20',
    'cci_01',
    'cci_02',
    'cci_03',
    'cci_04',
    'cci_05',
    'cci_06',
    'cci_07',
    'clm_dev_01',
    'clm_dev_02',
    'clm_dev_03',
    'clm_dev_04',
    'clm_dev_05',
    'clm_dev_06',
    'clm_dev_07',
    'clm_dev_08',
    'clm_dev_09',
    'clm_dev_10',
    'clm_dev_11',
    'clm_dev_12',
    'clm_dev_13',
    'clm_dev_14',
    'clm_dev_15',
    'clm_dev_16',
    'clm_dev_17',
    'clm_dev_18',
    'clm_dev_19',
    'clm_dev_20',
    'clm_dev_21',
    'clm_dev_22',
    'clm_dev_23',
    'clm_dev_24',
    'clm_dev_25',
    'clm_dev_26',
    'clm_dev_27',
    'clm_dev_28',
    'clm_dev_29',
    'clm_dev_30',
    'common',
    'devops001gs0',
    'devops002gs0',
    'devops003gs0',
    'devops004gs0',
    'devops005gs0',
    'devops006r1',
    'devops007r1',
    'devops008r1',
    'devops009r1',
    'devops010r1',
    'devopsimpkg01',
    'devopsimpkg11',
    'devopsimpkg12',
    'devopsimpkg13',
    'devopsimpkg14',
    'devopsimpkg15',
    'devopsimpkg16',
    'devopsimpkg17',
    'devopsimpkg18',
    'devopsimpkg19',
    'devopsimpkg20',
    'devopsimpkg21',
    'devopsimpkg22',
    'devopsimpkg23',
    'devopsimpkg24',
    'devopsimpkg25',
    'devopsimpkg26',
    'foundationpkgtest',
    'industries001',
    'industriesgs0',
    'ins_exp_pc01',
    'ins_exp_pc02',
    'ins_exp_pc03',
    'ins_exp_vb01',
    'ins_exp_vb02',
    'ins_exp_vb03',
    'ins_fsc04_gs0',
    'instest12',
    'kc_na46',
    'pc_dev_na46',
    'pc_qe_na46',
    'perf_dc230',
    'scalpel',
    'sfi_media_1',
    'sfi_media_2',
    'sfi_media_3',
    'sfi_media_4',
    'sfi_media_5',
    'sfi_media_6',
    'sfi_media_7',
    'sfi_media_8',
    'sfi_media_9',
    'sfi_media_10',
    'slncloud_na81_0',
    'slncloud_na81_1',
    'slncloud_r1_01',
    'slncloud_r1_02',
    'slncloud_stg_01',
    'slncloud_test',
    'solutioncloud',
    'stmfahins01_oie',
    'stmpahins01',
    'vb_dev_na46',
    'vb_qe_na46',
    'vlocity_bmk',
    'vlocity_clmperf',
    'vlocity_cmt',
    'vlocity_cpq1',
    'vlocity_cpq2',
    'vlocity_cpq3',
    'vlocity_cpq4',
    'vlocity_cpq5',
    'vlocity_cpq6',
    'vlocity_cpq7',
    'vlocity_cpq8',
    'vlocity_cpq9',
    'vlocity_cpq10',
    'vlocity_cpq11',
    'vlocity_cpq12',
    'vlocity_cpq13',
    'vlocity_cpq14',
    'vlocity_cpq15',
    'vlocity_cpq16',
    'vlocity_cpq17',
    'vlocity_cpq18',
    'vlocity_cpq19',
    'vlocity_cpq20',
    'vlocity_cpq21',
    'vlocity_cpq22',
    'vlocity_cpq23',
    'vlocity_cpq24',
    'vlocity_cpq25',
    'vlocity_cpq26',
    'vlocity_cpq27',
    'vlocity_cpq28',
    'vlocity_cpq29',
    'vlocity_cpq30',
    'vlocity_cpq31',
    'vlocity_cpq32',
    'vlocity_cpq33',
    'vlocity_cpq34',
    'vlocity_cpq35',
    'vlocity_cpq36',
    'vlocity_cpq37',
    'vlocity_cpq38',
    'vlocity_cpq39',
    'vlocity_cpq40',
    'vlocity_dc',
    'vlocity_digital',
    'vlocity_erg',
    'vlocity_fsc_gs0',
    'vlocity_ins',
    'vlocity_ins_fsc',
    'vlocity_lwc1',
    'vlocity_lwc2',
    'vlocity_lwc3',
    'vlocity_lwc4',
    'vlocity_lwc5',
    'vlocity_lwc6',
    'vlocity_lwc7',
    'vlocity_lwc8',
    'vlocity_lwc9',
    'vlocity_lwc10',
    'vlocity_lwc11',
    'vlocity_lwc12',
    'vlocity_lwc13',
    'vlocity_lwc14',
    'vlocity_lwc15',
    'vlocity_lwc16',
    'vlocity_lwc17',
    'vlocity_lwc18',
    'vlocity_lwc19',
    'vlocity_lwc20',
    'vlocity_lwc21',
    'vlocity_lwc22',
    'vlocity_lwc23',
    'vlocity_lwc24',
    'vlocity_lwc25',
    'vlocity_lwc26',
    'vlocity_lwc27',
    'vlocity_lwc28',
    'vlocity_lwc29',
    'vlocity_lwc30',
    'vlocity_lwc31',
    'vlocity_lwc32',
    'vlocity_lwc33',
    'vlocity_lwctest',
    'vlocity_perf',
    'vlocity_ps',
    'vlocity_upc',
    'vlocityins1',
    'vlocityins2',
    'vlocityins2_fsc',
    'vlocityins3',
    'vlocityins4',
    'vlocityins5',
    'vlocityins6',
    'vlocityins7',
    'vlocityins8',
    'vlocityins9',
    'vlocityins10',
    'vlocityins11',
    'vlocityins12',
    'vlocityins13',
    'vlocityins14',
    'vlocityins16',
    'vlocityins17',
    'vlocityins19',
  ]);

  // Define the fields to retrieve from the Publisher object
  private static readonly fields = ['MajorVersion', 'MinorVersion', 'NamespacePrefix', 'Name'];

  // Define the object name for querying installed packages
  private static readonly objectName = 'Publisher';

  // Define the fields to retrieve from the Organization object
  private static readonly orgFields = ['Name'];

  // Define the object name for querying installed packages
  private static readonly orgObjectName = 'Organization';

  private static readonly standardDataModel = 'Standard';
  private static readonly customDataModel = 'Custom';

  private static readonly omnistudioFoundationPackage = 'Omnistudio Foundation Package';
  private static readonly vlocityIndustriesManagedPackage = 'Vlocity Industries managed package';

  /**
   * Fetches package details (version and namespace) for specific installed packages.
   *
   * @param connection - Salesforce connection object
   * @returns Promise resolving to an array of PackageDetail objects
   */
  public static async getOrgDetails(connection: Connection): Promise<OmnistudioOrgDetails> {
    // Query all installed packages and cast the result to InstalledPackage[]
    const allInstalledPackages = (await QueryTools.queryAll(
      connection,
      '',
      this.objectName,
      this.fields
    )) as unknown as InstalledPackage[];

    let hasValidNamespace = true;
    const orgDetails = (await QueryTools.queryAll(
      connection,
      '',
      this.orgObjectName,
      this.orgFields
    )) as unknown as OrgDetails;

    let packageDetails: PackageDetail = {
      version: '',
      namespace: '',
    };

    const installedOmniPackages = [];
    for (const pkg of allInstalledPackages) {
      if (this.namespaces.has(pkg.NamespacePrefix)) {
        installedOmniPackages.push(pkg);
      }
    }

    // Handle multiple packages by prompting user to select one
    if (installedOmniPackages.length > 1) {
      Logger.log(messages.getMessage('multiplePackagesFound'));
      installedOmniPackages.sort((a, b) => a.NamespacePrefix.localeCompare(b.NamespacePrefix));
      // Display available packages
      for (let i = 0; i < installedOmniPackages.length; i++) {
        const pkg = installedOmniPackages[i];
        Logger.log(`${i + 1}. ${pkg.NamespacePrefix} - Version ${pkg.MajorVersion}.${pkg.MinorVersion}`);
      }

      // Prompt user to select a package
      let selectedIndex: number;
      do {
        const selection = await Logger.prompt(
          messages.getMessage('packageSelectionPrompt', [installedOmniPackages.length.toString()])
        );
        selectedIndex = parseInt(selection, 10) - 1;

        if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= installedOmniPackages.length) {
          Logger.warn(messages.getMessage('invalidPackageSelection', [installedOmniPackages.length.toString()]));
        }
      } while (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= installedOmniPackages.length);

      // Set the selected package details
      const selectedPackage = installedOmniPackages[selectedIndex];
      packageDetails.version = `${selectedPackage.MajorVersion}.${selectedPackage.MinorVersion}`;
      packageDetails.namespace = selectedPackage.NamespacePrefix;

      Logger.log(messages.getMessage('selectedPackage', [selectedPackage.NamespacePrefix, packageDetails.version]));
    } else if (installedOmniPackages.length === 1) {
      // Only one package found, use it automatically
      const pkg = installedOmniPackages[0];
      packageDetails.version = `${pkg.MajorVersion}.${pkg.MinorVersion}`;
      packageDetails.namespace = pkg.NamespacePrefix;
    } else {
      // return to validate the org information
      return {
        packageDetails: undefined,
        omniStudioOrgPermissionEnabled: false,
        orgDetails: orgDetails[0],
        dataModel: undefined,
        hasValidNamespace: false,
        isFoundationPackage: false,
        isOmnistudioMetadataAPIEnabled: false,
        isDRVersioningEnabled: false,
      };
    }

    //Execute apex rest resource to get omnistudio org permission
    const omniStudioOrgPermissionEnabled: boolean = await this.isOmniStudioOrgPermissionEnabled(
      connection,
      packageDetails.namespace
    );

    const isFoundationPackage: boolean = await OrgPreferences.isFoundationPackage(connection);
    const isOmnistudioMetadataAPIEnabled: boolean = await this.isOmnistudioMetadataAPIEnabled(
      connection,
      packageDetails.namespace
    );

    let isDRVersioningEnabled = false;
    try {
      isDRVersioningEnabled = await OrgPreferences.checkDRVersioning(connection);
    } catch (error) {
      Logger.error(`Error checking DR Versioning org preference`);
    }

    const orgDataModel = omniStudioOrgPermissionEnabled ? this.standardDataModel : this.customDataModel;
    const orgPackageType = isFoundationPackage
      ? this.omnistudioFoundationPackage
      : this.vlocityIndustriesManagedPackage;
    const isOmnistudioMetadataOn = isOmnistudioMetadataAPIEnabled ? Constants.On : Constants.Off;

    Logger.log(
      messages.getMessage('orgUsecaseDetails', [orgDataModel.toLowerCase(), orgPackageType, isOmnistudioMetadataOn])
    );

    return {
      packageDetails: packageDetails,
      omniStudioOrgPermissionEnabled: omniStudioOrgPermissionEnabled,
      orgDetails: orgDetails[0],
      dataModel: omniStudioOrgPermissionEnabled ? this.standardDataModel : this.customDataModel,
      hasValidNamespace: hasValidNamespace,
      isFoundationPackage: isFoundationPackage,
      isOmnistudioMetadataAPIEnabled: isOmnistudioMetadataAPIEnabled,
      isDRVersioningEnabled: isDRVersioningEnabled,
    };
  }

  /**     *
   * @param connection  Salesforce connection object
   * @param namespace namespace of the org which is required to hit the apex rest resource.
   * @returns
   */
  public static async isOmniStudioOrgPermissionEnabled(connection: Connection, namespace: string): Promise<boolean> {
    try {
      return await connection.apex.get('/' + namespace + '/v1/orgPermission');
    } catch (e) {
      // Any error in the apex mechanism will fallback to check the standard designer status
      return await OrgPreferences.isStandardDesignerEnabled(connection, namespace);
    }
  }

  /**
   * Checks if the org has Omnistudio Metadata API enabled
   * @param connection
   * @param namespace
   * @returns
   */
  public static async isOmnistudioMetadataAPIEnabled(connection: Connection, namespace: string): Promise<boolean> {
    try {
      const omniStudioSettingsPrefManager = new OmnistudioSettingsPrefManager(connection, messages);

      // Run both async operations in parallel
      const isOmniStudioSettingsMetadataEnabled = await Promise.resolve(
        omniStudioSettingsPrefManager.isOmniStudioSettingsMetadataEnabled()
      );

      return isOmniStudioSettingsMetadataEnabled;
    } catch (error) {
      Logger.error(`Error checking org Omnistudio metadata API status`);
      return false;
    }
  }
}
