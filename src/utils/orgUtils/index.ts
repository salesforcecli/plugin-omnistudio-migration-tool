/* eslint-disable */

import { Connection } from '@salesforce/core';
import { QueryTools } from '../query';

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
}

export interface PackageDetail {
  version: string;
  namespace: string;
}

export class OrgUtils {
  /**
   * Skip the 'omnistudio' namespace because it belongs to the foundation package,
   * which already works with the standard model and does not need migration.
   * */
  private static readonly namespaces = new Set<string>([
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
  /**
   * Fetches package details (version and namespace) for specific installed packages.
   *
   * @param connection - Salesforce connection object
   * @returns Promise resolving to an array of PackageDetail objects
   */
  public static async getOrgDetails(connection: Connection, namespace: string): Promise<OmnistudioOrgDetails> {
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

    for (const pkg of allInstalledPackages) {
      if (namespace && namespace === pkg.NamespacePrefix) {
        packageDetails.version = `${pkg.MajorVersion}.${pkg.MinorVersion}`;
        packageDetails.namespace = pkg.NamespacePrefix;
        break;
      }
    }

    if (packageDetails.namespace === '') {
      hasValidNamespace = false;
      for (const pkg of allInstalledPackages) {
        if ((namespace && namespace === pkg.NamespacePrefix) || this.namespaces.has(pkg.NamespacePrefix)) {
          packageDetails.version = `${pkg.MajorVersion}.${pkg.MinorVersion}`;
          packageDetails.namespace = pkg.NamespacePrefix;
          break; // Exit loop after first match
        }
      }
    }

    //Execute apex rest resource to get omnistudio org permission
    const omniStudioOrgPermissionEnabled: boolean = await this.isOmniStudioOrgPermissionEnabled(
      connection,
      packageDetails.namespace
    );

    return {
      packageDetails: packageDetails,
      omniStudioOrgPermissionEnabled: omniStudioOrgPermissionEnabled,
      orgDetails: orgDetails[0],
      dataModel: omniStudioOrgPermissionEnabled ? this.standardDataModel : this.customDataModel,
      hasValidNamespace: hasValidNamespace,
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
      // Returning false as a fallback when the endpoint is not found.
      // As part of the 256 MVP, we don't want to block the migration just because the endpoint is missing.
      return !(e.errorCode === 'NOT_FOUND');
    }

    return true;
  }
}