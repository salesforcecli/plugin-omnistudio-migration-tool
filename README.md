# OmniStudio Migration Tool

### Before You Begin

Read and follow the directions in the Omnistudio migration documentation: https://help.salesforce.com/s/articleView?id=sf.os_migrate_omnistudio_custom_objects_to_standard_objects.htm&type=5

## Running SFDX plugin

1. Install SFDX cli using the official documentation located [here](https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_install_cli.htm).
2. Authenticate your SFDX cli into the org you are going to use for development. You can follow authentication steps [here](https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference/cli_reference_auth_web.htm).
3. In a new terminal session, install the plugin using the following command

```
sfdx plugins:install @salesforce/plugin-omnistudio-migration-tool
```

4. To run the migration tool, run the following command from your command line tool:

```
// To migrate everything
sfdx omnistudio:migration:migrate -u YOUR_ORG_USERNAME@DOMAIN.COM --namespace=VLOCITY_PACKAGE_NAMESPACE

//to migrate specific components: FlexCards, DataMappers, Integration Procedures, or OmniScripts, add the following parameters:
--only=dr
--only=ip
--only=os
--only=fc

//to migrate all versions of the components and not just the active ones:
--allversions
```

5. An HTML page will be open in your default browser with the results of your migration job.

### Usage & parameters

```
USAGE
  $ sfdx omnistudio:migration:migrate [-n <string>] [-f] [-v <string>] [-u <string>] [--apiversion <string>] [--json] [--loglevel
  trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL]

OPTIONS
  -n, --namespace=namespace                                                         the namespace of the vertical package

  -u, --targetusername=targetusername                                               username or alias for the target
                                                                                    org; overrides default target org

  -v, --targetdevhubusername=targetdevhubusername                                   username or alias for the dev hub
                                                                                    org; overrides default dev hub org

  --apiversion=apiversion                                                           override the api version used for
                                                                                    api requests made by this command

  --json                                                                            format output as json

  --loglevel=(trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL)  [default: warn] logging level for
                                                                                    this command invocation

  -a, --allversions                                                                 migrate all versions and not
                                                                                    and not just the active ones.

  --relatedobjects=relatedobjects                                                   Please select the type of components to
                                                                                    migrate: 'apex' for Apex classes, 'lwc' for Lightning Web Components, or 'apex,lwc' if you want to include both types.

```

> **Note:** LWC (Lightning Web Components) migration functionality is temporarily disabled in the current version. This includes LWC migration, assessment, and report generation features. These features will be re-enabled in a future release. Apex migration functionality remains fully available. The `--relatedobjects` flag accepts all values ('apex', 'lwc', 'apex,lwc'), but LWC-related operations will not be executed.

Terms:
Notwithstanding anything stated in the terms and conditions agreed between Salesforce (‘SFDC’) and you (‘Customer’), the use of the OmniStudio Migration Tool (‘Tool’) is designed to facilitate the migration and it’s going to modify your custom code and by deploying and using the Tool you hereby provide your consent to automate the migration process and enable a smooth transition. Customer shall access and use the Tool only as permitted to the Customer and shall not compromise, break or circumvent any technical processes or security measures associated with the services provided by SFDC.
The Customer agrees to hold harmless, indemnify, and defend SFDC, and its officers, directors, agents, employees, licensees, successors and assigns (collectively, the “Indemnified Parties”) against any and all damages, penalties, losses, liabilities, judgments, settlements, awards, costs, and expenses (including reasonable attorneys’ fees and expenses) to the extent arising out of or in connection with any claims related to the Customers use of the Tool or any willful misconduct, fraud or grossly negligent acts or omissions by the Customer.
